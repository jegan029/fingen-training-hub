#!/usr/bin/env python3
"""Fail if user-facing text contains dashes.

Flags em dashes, en dashes and hyphens used as separators (" - ", " -- ") in:
  * display fields of backend/app/data/demo_dataset.json (paths, nodes, runbooks),
  * string literals and JSX text in frontend/src/**/*.tsx and *.ts,
  * string literals in backend/app/**/*.py,
  * frontend/index.html.

Not flagged: code (fenced blocks, inline `code`, SQL in runbook steps), comments, markdown
list markers at the start of a line, hyphenated identifiers and compound words.

Usage: python scripts/check_no_dashes.py [--list]
"""
import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "backend" / "app" / "data" / "demo_dataset.json"

DASH = re.compile(r"[—–]|(?<=\S) -{1,2} (?=\S)|(?<=\w)--(?=\w)")

NODE_FIELDS = ("title", "description", "content", "sample_question", "sample_answer",
               "scenario_context", "scenario_options", "scenario_explanation")
RUNBOOK_FIELDS = ("title", "category", "description", "preconditions", "steps", "escalation_triggers")
PATH_FIELDS = ("title", "description")

FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")
# SQL statements (runbook steps, sample answers, scenario options): up to the next semicolon or the
# end of the text. Keywords must be followed by SQL structure so prose like "SELECT only" is kept.
SQL = re.compile(r"\b(?:SELECT\b[^;]*?\bFROM\b|UPDATE\s+\w+\s+SET\b|INSERT\s+INTO\b|DELETE\s+FROM\b)[^;]*;?")
LIST_MARKER = re.compile(r"^(\s*)- ", re.MULTILINE)
SKIP_FILES = {"check_no_dashes.py"}


def prose(text: str, sql: bool = False) -> str:
    """Remove code and markdown syntax, leaving only text a reader sees as prose."""
    text = FENCE.sub(" ", text)
    text = INLINE_CODE.sub(" ", text)
    if sql:
        text = SQL.sub(" ", text)
    return LIST_MARKER.sub(r"\1", text)


# Hyphenated compounds that were rewritten in prose; flagged so they do not creep back in.
COMPOUNDS = re.compile(
    r"(?<![\w/.@-])(real-time|open-ended|multiple-choice|day-one|end-to-end|read-only|on-call|"
    r"pre-production|platform-wide|client-facing|cut-off|re-run|re-running)(?![\w/-])",
    re.IGNORECASE,
)


def find(text: str) -> list[str]:
    hits = []
    for m in [*DASH.finditer(text), *COMPOUNDS.finditer(text)]:
        start, end = max(0, m.start() - 30), min(len(text), m.end() + 30)
        hits.append(text[start:end].replace("\n", " "))
    return hits


def flatten(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [s for v in value for s in flatten(v)]
    return []


def check_dataset() -> dict[str, list[str]]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    hits: list[str] = []
    for path in data.get("paths", []):
        for field in PATH_FIELDS:
            hits += find(prose(path.get(field, "")))
        for node in path.get("nodes", []):
            for field in NODE_FIELDS:
                for text in flatten(node.get(field)):
                    hits += [f"node {node['id']} {field}: {h}" for h in find(prose(text, sql=True))]
    for rb in data.get("runbooks", []):
        for field in RUNBOOK_FIELDS:
            for text in flatten(rb.get(field)):
                hits += [f"runbook {rb['id']} {field}: {h}" for h in find(prose(text, sql=True))]
    return {str(DATASET.relative_to(ROOT)): hits}


# ── Source files ────────────────────────────────────────────

TS_COMMENT = re.compile(r"/\*.*?\*/|(?<![:'\"`])//[^\n]*", re.DOTALL)
JSX_COMMENT = re.compile(r"\{/\*.*?\*/\}", re.DOTALL)
TS_STRING = re.compile(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`")
JSX_TEXT = re.compile(r"[>}]([^<>{}]+)[<{]")
TEMPLATE_EXPR = re.compile(r"\$\{[^}]*\}")


def check_ts(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8")
    src = JSX_COMMENT.sub(" ", src)
    src = TS_COMMENT.sub(" ", src)
    # Template literal ${...} expressions are code (for example SVG path arithmetic), not text.
    pieces = [TEMPLATE_EXPR.sub(" ", m.group(0)[1:-1]) for m in TS_STRING.finditer(src)]
    # Text between tags; fragments with = or ; are TypeScript that happened to sit between < and >.
    pieces += [t for m in JSX_TEXT.finditer(TS_STRING.sub('""', src)) if not re.search(r"[=;]", t := m.group(1))]
    return [h for p in pieces for h in find(p)]


def check_py(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstrings = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant)
    }
    hits = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            hits += find(node.value)
    return hits


def check_html(path: Path) -> list[str]:
    text = re.sub(r"<!--.*?-->", " ", path.read_text(encoding="utf-8"), flags=re.DOTALL)
    return find(re.sub(r"<[^>]+>", " ", text))


def check_sources() -> dict[str, list[str]]:
    results: dict[str, list[str]] = {}
    frontend = ROOT / "frontend" / "src"
    for path in sorted([*frontend.rglob("*.tsx"), *frontend.rglob("*.ts")]):
        if ".test." in path.name or path.name.endswith(".d.ts"):
            continue
        results[str(path.relative_to(ROOT))] = check_ts(path)
    for path in sorted((ROOT / "backend" / "app").rglob("*.py")):
        if path.name not in SKIP_FILES:
            results[str(path.relative_to(ROOT))] = check_py(path)
    results["frontend/index.html"] = check_html(ROOT / "frontend" / "index.html")
    return results


def main() -> int:
    show = "--list" in sys.argv
    results = {**check_dataset(), **check_sources()}
    total = 0
    for file, hits in results.items():
        if not hits:
            continue
        total += len(hits)
        print(f"{len(hits):4}  {file}")
        if show:
            for h in hits:
                print(f"        {h}")
    if total:
        print(f"\n{total} dash(es) in user-facing text. Run with --list to see them.")
        return 1
    print("No dashes in user-facing text.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
