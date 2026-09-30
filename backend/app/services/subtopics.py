"""Seed-time extraction of roadmap subtopics from node markdown content."""

import re
from typing import TypedDict


class Subtopic(TypedDict):
    title: str
    summary: str


# Sections every node has; they describe the node itself, not a subtopic.
_SKIPPED_HEADINGS = {"overview"}
_SUMMARY_LIMIT = 160

_HEADING = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s")


def _plain(text: str) -> str:
    """Strip inline markdown so summaries read as plain text."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\([^)]*\)", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def _first_sentence(body: str) -> str:
    """First readable sentence of a section: skips code blocks and tables, uses list items as sentences."""
    in_code = False
    for raw in body.splitlines():
        line = raw.strip()
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not line or line.startswith("|"):
            continue
        line = re.sub(r"^([-*•]|\d+\.)\s+", "", line)
        text = _plain(line)
        if not text:
            continue
        return _clip(_SENTENCE_END.split(text, maxsplit=1)[0])
    return _table_or_code_summary(body)


def _clip(text: str) -> str:
    if len(text) <= _SUMMARY_LIMIT:
        return text
    return text[: _SUMMARY_LIMIT - 1].rsplit(" ", 1)[0] + "…"


def _table_or_code_summary(body: str) -> str:
    """For sections that are only a table or code: the table's first column, SQL comments, or the first code line."""
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    rows = [line for line in lines if line.startswith("|")]
    if len(rows) > 2:
        # Skip the header and the |---| separator; keep the first cell of each data row.
        cells = [_plain(r.strip("|").split("|")[0]) for r in rows[2:]]
        return _clip(", ".join(c for c in cells if c))
    code = [line for line in lines if not line.startswith("```")]
    comments = [line.lstrip("-# ").strip() for line in code if line.startswith(("--", "#"))]
    if comments:
        return _clip(", ".join(c for c in comments if c))
    return _clip(code[0]) if code else ""


def _from_headings(content: str) -> list[Subtopic]:
    matches = list(_HEADING.finditer(content))
    subtopics: list[Subtopic] = []
    for i, match in enumerate(matches):
        title = _plain(match.group(1))
        if title.lower() in _SKIPPED_HEADINGS:
            continue
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        subtopics.append({"title": title, "summary": _first_sentence(content[match.end() : end])})
    return subtopics


def _from_prose(content: str) -> list[Subtopic]:
    """Fallback for content without headings: the list in an 'includes/covers X, Y and Z' sentence."""

    def split_items(sentence: str, min_len: int) -> list[str]:
        parts = re.split(r",\s*", re.sub(r",?\s+and\s+", ",", sentence, flags=re.IGNORECASE))
        return [p.strip() for p in parts if min_len < len(p.strip()) < 50]

    match = re.search(r"(?:include[sd]?|cover[sd]?)\s+([^.]+)", content, re.IGNORECASE)
    if match:
        items = split_items(match.group(1), 2)
        if len(items) >= 2:
            return [{"title": t, "summary": ""} for t in items[:5]]
    for sentence in re.split(r"\.\s*", content):
        items = split_items(sentence, 3)
        if len(items) >= 3:
            return [{"title": t, "summary": ""} for t in items[-4:]]
    return []


def extract_subtopics(content: str) -> list[Subtopic]:
    if not content:
        return []
    return _from_headings(content) or _from_prose(content)
