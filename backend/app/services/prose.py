"""The "no dashes in user facing text" rule, shared by scripts/check_no_dashes.py and content ingestion.

`find` reports dashes in prose; `normalise_dashes` rewrites synced content so learners never see
them. Both treat code (fenced blocks, inline code), SQL statements and URLs as untouchable.
"""

import re

DASH = re.compile(r"[—–]|(?<=\S) -{1,2} (?=\S)|(?<=\w)--(?=\w)")

FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")
# SQL statements (runbook steps, sample answers, scenario options): up to the next semicolon or the
# end of the text. Keywords must be followed by SQL structure so prose like "SELECT only" is kept.
SQL = re.compile(r"\b(?:SELECT\b[^;]*?\bFROM\b|UPDATE\s+\w+\s+SET\b|INSERT\s+INTO\b|DELETE\s+FROM\b)[^;]*;?")
LIST_MARKER = re.compile(r"^(\s*)- ", re.MULTILINE)

# Hyphenated compounds that were rewritten in prose; flagged so they do not creep back in.
COMPOUNDS = re.compile(
    r"(?<![\w/.@-])(real-time|open-ended|multiple-choice|day-one|end-to-end|read-only|on-call|"
    r"pre-production|platform-wide|client-facing|cut-off|re-run|re-running)(?![\w/-])",
    re.IGNORECASE,
)
# These close up instead of becoming two words.
_CLOSED_UP = {"pre-production", "cut-off", "re-run", "re-running"}


def prose(text: str, sql: bool = False) -> str:
    """Remove code and markdown syntax, leaving only text a reader sees as prose."""
    text = FENCE.sub(" ", text)
    text = INLINE_CODE.sub(" ", text)
    if sql:
        text = SQL.sub(" ", text)
    return LIST_MARKER.sub(r"\1", text)


def find(text: str) -> list[str]:
    hits = []
    for m in [*DASH.finditer(text), *COMPOUNDS.finditer(text)]:
        start, end = max(0, m.start() - 30), min(len(text), m.end() + 30)
        hits.append(text[start:end].replace("\n", " "))
    return hits


# ── Normaliser ──────────────────────────────────────────────

# Spans that must survive byte for byte: code, SQL, markdown link targets and bare URLs.
_PROTECTED = re.compile(
    r"```.*?```"
    r"|`[^`\n]*`"
    r"|" + SQL.pattern + r"|\]\([^)\s]*\)"
    r"|https?://[^\s)\]>]+",
    re.DOTALL,
)
_PLACEHOLDER = "\x00{}\x00"
_RESTORE = re.compile(r"\x00(\d+)\x00")

# "5–10", "P1–P4": an unspaced en dash between word characters is a range.
_RANGE = re.compile(r"(?<=\w)–(?=\w)")
# A short label at the start of a line (optionally after a list marker or bold): "Step 1 — do this".
_LABEL = re.compile(r"^([ \t]*(?:[-*+] |\d+\. )?[^\n.,;:!?—–]{1,40}?)[ \t]+(?:[—–]|-{1,2})[ \t]+(?=\S)", re.MULTILINE)
# Any other separator dash: spaced or unspaced em dash, spaced en dash, " - ", " -- ", "word--word".
_SEPARATOR = re.compile(r"[ \t]*—[ \t]*|[ \t]+–[ \t]+|(?<=\S)[ \t]+-{1,2}[ \t]+(?=\S)|(?<=\w)--(?=\w)")
_DOUBLE_PUNCT = re.compile(r",[ \t]*([,.;:!?)])")
_TRAILING_COMMA = re.compile(r",[ \t]*$", re.MULTILINE)
_LEADING_COMMA = re.compile(r"^([ \t]*(?:[-*+] |\d+\. )?), ", re.MULTILINE)


def _label(m: re.Match[str]) -> str:
    # Only real labels take a colon: emphasised text ("**Owner**"), one word ("Note") or a word and a
    # number ("Step 2"). Anything else is a sentence, and the separator rule turns the dash into a comma.
    label = re.sub(r"^[ \t]*(?:[-*+] |\d+\. )?", "", m.group(1)).strip()
    words = label.split()
    is_label = "\x00" not in label and (
        bool(re.fullmatch(r"(\*\*|__|\*|_).+\1", label)) or len(words) == 1 or (len(words) == 2 and words[1].isdigit())
    )
    return f"{m.group(1)}: " if is_label else m.group(0)


def _compound(m: re.Match[str]) -> str:
    word = m.group(0)
    return word.replace("-", "") if word.lower() in _CLOSED_UP else word.replace("-", " ")


def normalise_dashes(text: str) -> str:
    """Rewrite dashes in prose: ranges become "to", labels take a colon, other separators a comma.

    Code, SQL and URLs are masked first and restored unchanged afterwards. Markdown list markers
    ("- item" at the start of a line) are not separators and stay as they are.
    """
    if not text:
        return text
    saved: list[str] = []

    def protect(m: re.Match[str]) -> str:
        saved.append(m.group(0))
        return _PLACEHOLDER.format(len(saved) - 1)

    out = _PROTECTED.sub(protect, text)
    out = _RANGE.sub(" to ", out)
    out = _LABEL.sub(_label, out)
    out = _SEPARATOR.sub(", ", out)
    out = COMPOUNDS.sub(_compound, out)
    out = _DOUBLE_PUNCT.sub(r"\1", out)
    out = _TRAILING_COMMA.sub("", out)
    out = _LEADING_COMMA.sub(r"\1", out)
    return _RESTORE.sub(lambda m: saved[int(m.group(1))], out)
