"""Article HTML to safe markdown.

1. nh3 removes everything outside a small allowlist: scripts and styles with their content, iframes,
   objects, event handlers, inline styles, and any URL scheme other than http, https and mailto.
2. markdownify converts what is left. Images survive only when they are attachments of the article
   that were synced (served by the Training Hub); remote images are dropped. Links to other KB articles
   become Training Hub links when that article is synced, otherwise links to the instance.
3. A last pass drops any markdown link whose target is not http(s), mailto or a site relative path.

The raw HTML is kept separately as the source of truth and is never rendered.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import nh3
from markdownify import MarkdownConverter

ALLOWED_TAGS = {
    "a", "b", "blockquote", "br", "code", "dd", "del", "div", "dl", "dt", "em", "h1", "h2", "h3", "h4",
    "h5", "h6", "hr", "i", "img", "kbd", "li", "ol", "p", "pre", "s", "span", "strong", "sub", "sup",
    "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
}  # fmt: skip
ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"}

_KB_REF = re.compile(r"sysparm_article(?:=|%3D)(KB\d{4,12})", re.IGNORECASE)
_ATTACHMENT_REF = re.compile(r"sys_attachment\.do\?(?:[^#\s]*&)?sys_id=([0-9a-f]{32})", re.IGNORECASE)
# Link targets may contain one level of parentheses, as in javascript:alert(1), which must be caught too.
_MD_LINK = re.compile(r"(!?)\[((?:[^\[\]\\]|\\.)*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)")
_SAFE_TARGET = re.compile(r"^(?:https?://|mailto:|/(?!/))", re.IGNORECASE)
_BLANK_LINES = re.compile(r"\n{3,}")


@dataclass
class LinkContext:
    instance_base: str  # https://host of the instance (placeholder in mock mode)
    is_synced: Callable[[str], bool]  # KB number is an article the Training Hub has
    attachment_url: Callable[[str], str | None] = lambda _sys_id: None  # image attachment sys_id to local URL


@dataclass
class Converted:
    markdown: str
    linked_kb_numbers: list[str] = field(default_factory=list)


def _resolve_link(href: str, ctx: LinkContext, linked: list[str]) -> str | None:
    href = (href or "").strip()
    if not href or href.startswith("#"):
        return None
    parts = urlsplit(href)
    if parts.scheme and parts.scheme.lower() not in ("http", "https", "mailto"):
        return None
    if parts.scheme.lower() == "mailto":
        return href
    instance_host = urlsplit(ctx.instance_base).hostname
    on_instance = (not parts.scheme and not parts.netloc) or (parts.hostname or "").lower() == instance_host
    if not parts.scheme and parts.netloc:
        return None  # protocol relative URL: ambiguous, dropped
    if not on_instance:
        return href
    match = _KB_REF.search(href)
    if match:
        number = match.group(1).upper()
        if number not in linked:
            linked.append(number)
        if ctx.is_synced(number):
            return f"/knowledge/kb/{number}"
        return f"{ctx.instance_base}/kb_view.do?sysparm_article={number}"
    if not parts.path.startswith("/"):
        return None  # a relative path on the instance cannot be resolved reliably
    query = f"?{parts.query}" if parts.query else ""
    return f"{ctx.instance_base}{parts.path}{query}"


class _Converter(MarkdownConverter):
    def __init__(self, ctx: LinkContext, linked: list[str], **options):
        super().__init__(**options)
        self.ctx = ctx
        self.linked = linked

    def convert_img(self, el, text, parent_tags):
        match = _ATTACHMENT_REF.search(el.get("src") or "")
        url = self.ctx.attachment_url(match.group(1).lower()) if match else None
        if not url:
            return ""  # remote or unsynced images are removed
        alt = re.sub(r"[\[\]\\]", "", el.get("alt") or "")
        return f"![{alt}]({url})"

    def convert_a(self, el, text, parent_tags):
        target = _resolve_link(el.get("href") or "", self.ctx, self.linked)
        if target is None:
            return text
        el["href"] = target
        el.attrs.pop("title", None)
        return super().convert_a(el, text, parent_tags)


def _drop_unsafe_links(markdown: str) -> str:
    def check(m: re.Match[str]) -> str:
        return m.group(0) if _SAFE_TARGET.match(m.group(3)) else ("" if m.group(1) else m.group(2))

    return _MD_LINK.sub(check, markdown)


def html_to_markdown(html: str, ctx: LinkContext) -> Converted:
    cleaned = nh3.clean(
        html or "",
        tags=ALLOWED_TAGS,
        clean_content_tags=DROP_WITH_CONTENT,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel=None,
        strip_comments=True,
    )
    linked: list[str] = []
    markdown = _Converter(ctx, linked, heading_style="ATX", bullets="-", strong_em_symbol="*").convert(cleaned)
    markdown = _drop_unsafe_links(markdown)
    markdown = _BLANK_LINES.sub("\n\n", markdown).strip()
    return Converted(markdown=markdown, linked_kb_numbers=linked)


# The converter emphasises with *, so underscores are text (identifiers like PENDING_GL) and stay.
_MD_SYNTAX = re.compile(r"[*`#>]|!\[[^\]]*\]\([^)]*\)")
_MD_LINK_TEXT = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def plain_text(html: str) -> str:
    return " ".join(nh3.clean(html or "", tags=set()).split())


def summarise(markdown: str, limit: int = 280) -> str:
    """First prose paragraph of the markdown, without markdown syntax, cut at a word boundary."""
    for block in markdown.split("\n\n"):
        block = block.strip()
        if not block or block[0] in "#|`!-*>" or re.match(r"^\d+\.", block):
            continue
        text = _MD_LINK_TEXT.sub(r"\1", block)
        text = " ".join(_MD_SYNTAX.sub("", text).replace("\\", "").split())
        if len(text) <= limit:
            return text
        return text[:limit].rsplit(" ", 1)[0] + "…"
    return ""
