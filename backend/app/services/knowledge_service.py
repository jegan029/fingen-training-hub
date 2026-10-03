"""Read access to synced knowledge articles, applications and documents.

Every query filters by the caller's clearance in SQL (`visible_sql`) and only returns active articles.
Something hidden and something missing look the same to callers (None or an empty list), so the
routers answer 404 in both cases and never confirm that hidden content exists.

Only constant SQL fragments from this module are interpolated into queries; values are bound.
"""

import sqlite3
from typing import Any

from ..db import connection, utc_now
from .classification import AUDITED, llm_allowed, visible_sql

KINDS = ("runbook", "sop", "other")
SORTS = {
    ("updated", "desc"): "k.source_updated_at DESC, k.id DESC",
    ("updated", "asc"): "k.source_updated_at ASC, k.id ASC",
    ("title", "asc"): "k.title COLLATE NOCASE ASC, k.id ASC",
    ("title", "desc"): "k.title COLLATE NOCASE DESC, k.id DESC",
}
_SUMMARY_COLUMNS = (
    "k.id, k.kb_number, k.title, k.summary, k.classification, k.kind, k.category, k.knowledge_base, "
    "k.version, k.source_updated_at, k.synced_at"
)


def _like(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _visible(clearance: str | None, alias: str = "k") -> tuple[str, tuple[str, ...]]:
    condition, levels = visible_sql(f"{alias}.classification", clearance)
    return f"{alias}.active = 1 AND {condition}", levels


def get_visible_article(article_id: int, clearance: str | None) -> sqlite3.Row | None:
    """The active article if this clearance may see it, otherwise None (whether hidden or missing)."""
    visible, levels = _visible(clearance)
    with connection() as conn:
        return conn.execute(
            f"SELECT k.* FROM kb_articles k WHERE k.id = ? AND {visible}",  # nosec B608
            (article_id, *levels),
        ).fetchone()


def article_id_by_number(kb_number: str, clearance: str | None) -> int | None:
    visible, levels = _visible(clearance)
    with connection() as conn:
        row = conn.execute(
            f"SELECT k.id FROM kb_articles k WHERE k.kb_number = ? AND {visible}",  # nosec B608
            (kb_number.upper(), *levels),
        ).fetchone()
    return row["id"] if row else None


# ── Lists ───────────────────────────────────────────────────


def _applications_for(conn: sqlite3.Connection, article_ids: list[int]) -> dict[int, list[dict]]:
    if not article_ids:
        return {}
    marks = ",".join("?" * len(article_ids))
    rows = conn.execute(
        "SELECT aa.article_id, a.id, a.app_number, a.name FROM article_applications aa "
        f"JOIN applications a ON a.id = aa.application_id WHERE aa.article_id IN ({marks}) "  # nosec B608
        "ORDER BY a.app_number",
        article_ids,
    ).fetchall()
    result: dict[int, list[dict]] = {}
    for r in rows:
        result.setdefault(r["article_id"], []).append({"id": r["id"], "app_number": r["app_number"], "name": r["name"]})
    return result


def _summaries(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[dict]:
    apps = _applications_for(conn, [r["id"] for r in rows])
    return [{**dict(r), "applications": apps.get(r["id"], [])} for r in rows]


def list_articles(
    clearance: str | None,
    *,
    q: str = "",
    classification: str | None = None,
    app_number: str | None = None,
    application_id: int | None = None,
    article_type: str | None = None,
    category: str | None = None,
    node_id: int | None = None,
    sort: str = "updated",
    order: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    visible, levels = _visible(clearance)
    where = [visible]
    params: list[Any] = list(levels)
    q = " ".join(q.split())
    if q:
        where.append(
            "(k.title LIKE ? ESCAPE '\\' OR k.summary LIKE ? ESCAPE '\\' OR k.kb_number LIKE ? ESCAPE '\\' "
            "OR k.body_markdown LIKE ? ESCAPE '\\')"
        )
        params += [_like(q)] * 4
    if classification:
        where.append("k.classification = ?")
        params.append(classification)
    if article_type:
        where.append("k.kind = ?")
        params.append(article_type)
    if category:
        where.append("k.category = ?")
        params.append(category)
    if app_number or application_id is not None:
        where.append(
            "EXISTS (SELECT 1 FROM article_applications aa JOIN applications a ON a.id = aa.application_id "
            "WHERE aa.article_id = k.id AND (a.app_number = ? OR a.id = ?))"
        )
        params += [app_number or "", application_id if application_id is not None else -1]
    if node_id is not None:
        where.append("EXISTS (SELECT 1 FROM article_nodes an WHERE an.article_id = k.id AND an.node_id = ?)")
        params.append(node_id)
    order_by = SORTS[(sort, order or ("asc" if sort == "title" else "desc"))]
    condition = " AND ".join(where)
    with connection() as conn:
        total = conn.execute(f"SELECT COUNT(1) FROM kb_articles k WHERE {condition}", params).fetchone()[0]  # nosec B608
        rows = conn.execute(
            f"SELECT {_SUMMARY_COLUMNS} FROM kb_articles k WHERE {condition} ORDER BY {order_by} LIMIT ? OFFSET ?",  # nosec B608
            (*params, page_size, (page - 1) * page_size),
        ).fetchall()
        items = _summaries(conn, rows)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "facets": facets(clearance)}


def facets(clearance: str | None) -> dict[str, list[dict]]:
    """Filter values (with counts) over everything this user can see, for the filter chips."""
    visible, levels = _visible(clearance)
    with connection() as conn:

        def counted(column: str) -> list[dict]:
            rows = conn.execute(
                f"SELECT {column} AS value, COUNT(1) AS count FROM kb_articles k "  # nosec B608
                f"WHERE {visible} AND {column} IS NOT NULL AND {column} != '' GROUP BY {column} ORDER BY {column}",
                levels,
            ).fetchall()
            return [{"value": r["value"], "label": r["value"], "count": r["count"]} for r in rows]

        apps = conn.execute(
            "SELECT a.app_number AS value, a.name AS label, COUNT(DISTINCT k.id) AS count FROM applications a "
            "JOIN article_applications aa ON aa.application_id = a.id JOIN kb_articles k ON k.id = aa.article_id "
            f"WHERE {visible} GROUP BY a.id ORDER BY a.app_number",  # nosec B608
            levels,
        ).fetchall()
        return {
            "classifications": counted("k.classification"),
            "kinds": counted("k.kind"),
            "categories": counted("k.category"),
            "applications": [dict(r) for r in apps],
        }


# ── One article ─────────────────────────────────────────────


def _documents(conn: sqlite3.Connection, article_ids: list[int]) -> list[dict]:
    if not article_ids:
        return []
    marks = ",".join("?" * len(article_ids))
    rows = conn.execute(
        "SELECT d.id, d.file_name, d.content_type, d.size_bytes, d.article_id, k.kb_number, k.title AS article_title "
        "FROM article_documents d JOIN kb_articles k ON k.id = d.article_id "
        f"WHERE d.kind = 'attachment' AND d.article_id IN ({marks}) ORDER BY d.article_id, d.file_name",  # nosec B608
        article_ids,
    ).fetchall()
    return [dict(r) for r in rows]


def article_detail(article_id: int, clearance: str | None, llm_ceiling: str) -> dict | None:
    row = get_visible_article(article_id, clearance)
    if row is None:
        return None
    visible, levels = _visible(clearance, "o")
    with connection() as conn:
        summary = _summaries(conn, [row])[0]
        documents = _documents(conn, [article_id])
        # Linked articles the reader may open; hidden or unsynced ones are left out entirely.
        linked = conn.execute(
            "SELECT DISTINCT o.id, o.kb_number, o.title FROM article_documents d "
            f"JOIN kb_articles o ON o.kb_number = d.linked_kb_number WHERE d.article_id = ? "
            f"AND d.kind = 'linked_article' AND {visible} ORDER BY o.kb_number",  # nosec B608
            (article_id, *levels),
        ).fetchall()
        nodes = conn.execute(
            "SELECT DISTINCT n.id, n.title, n.path_id, p.title AS path_title FROM article_nodes an "
            "JOIN nodes n ON n.id = an.node_id JOIN learning_paths p ON p.id = n.path_id "
            "WHERE an.article_id = ? ORDER BY n.id",
            (article_id,),
        ).fetchall()
    return {
        **summary,
        "body_markdown": row["body_markdown"],
        "source_url": row["source_url"],
        "llm_allowed": llm_allowed(row["classification"], llm_ceiling),
        "documents": documents,
        "linked_articles": [dict(r) for r in linked],
        "related_nodes": [dict(r) for r in nodes],
    }


# ── Applications ────────────────────────────────────────────


def _applications_query(clearance: str | None, extra: str) -> tuple[str, tuple]:
    """Applications with at least one visible article, with visible counts per type and documents."""
    visible, levels = _visible(clearance)
    visible_docs, _ = _visible(clearance, "k2")
    # Only constant fragments from _visible and the callers' fixed `extra` are interpolated; values are bound.
    sql = (
        "SELECT a.id, a.app_number, a.name, a.description, "  # nosec B608
        "SUM(k.kind = 'runbook') AS runbooks, SUM(k.kind = 'sop') AS sops, SUM(k.kind = 'other') AS other, "
        "(SELECT COUNT(1) FROM article_documents d JOIN article_applications x ON x.article_id = d.article_id "
        " JOIN kb_articles k2 ON k2.id = d.article_id WHERE x.application_id = a.id AND d.kind = 'attachment' "
        f" AND {visible_docs}) AS documents "
        "FROM applications a JOIN article_applications aa ON aa.application_id = a.id "
        f"JOIN kb_articles k ON k.id = aa.article_id WHERE a.active = 1 AND {visible} {extra} "
        "GROUP BY a.id ORDER BY a.app_number"
    )
    return sql, (*levels, *levels)


def _application(row: sqlite3.Row) -> dict:
    counts = {key: row[key] or 0 for key in ("runbooks", "sops", "other", "documents")}
    return {"id": row["id"], "app_number": row["app_number"], "name": row["name"],
            "description": row["description"], "counts": counts}  # fmt: skip


def list_applications(clearance: str | None) -> list[dict]:
    sql, params = _applications_query(clearance, "")
    with connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_application(r) for r in rows]


def application_detail(application_id: int, clearance: str | None) -> dict | None:
    """The application with its visible articles grouped by type, and their documents; None if none visible."""
    sql, params = _applications_query(clearance, "AND a.id = ?")
    visible, levels = _visible(clearance)
    with connection() as conn:
        app = conn.execute(sql, (*params, application_id)).fetchone()
        if app is None:
            return None
        rows = conn.execute(
            f"SELECT {_SUMMARY_COLUMNS} FROM kb_articles k JOIN article_applications aa ON aa.article_id = k.id "
            f"WHERE aa.application_id = ? AND {visible} ORDER BY k.title COLLATE NOCASE",  # nosec B608
            (application_id, *levels),
        ).fetchall()
        articles = _summaries(conn, rows)
        documents = _documents(conn, [r["id"] for r in rows])
    grouped = {kind: [a for a in articles if a["kind"] == kind] for kind in KINDS}
    return {**_application(app), "runbooks": grouped["runbook"], "sops": grouped["sop"],
            "other": grouped["other"], "documents": documents}  # fmt: skip


# ── Documents ───────────────────────────────────────────────


def document_for_download(document_id: int, clearance: str | None) -> sqlite3.Row | None:
    """A stored attachment of an article this user can see, or None."""
    visible, levels = _visible(clearance)
    with connection() as conn:
        return conn.execute(
            "SELECT d.id, d.file_name, d.content_type, d.storage_path, d.article_id, k.classification "
            "FROM article_documents d JOIN kb_articles k ON k.id = d.article_id "
            f"WHERE d.id = ? AND d.kind = 'attachment' AND d.storage_path IS NOT NULL AND {visible}",  # nosec B608
            (document_id, *levels),
        ).fetchone()


# ── Audit ───────────────────────────────────────────────────


def record_access(user_id: int, article_id: int, level: str, action: str, document_id: int | None = None) -> None:
    """Audit views and downloads of confidential and restricted content (lower levels are not logged)."""
    if level not in AUDITED:
        return
    with connection() as conn:
        conn.execute(
            "INSERT INTO kb_access_log (user_id, article_id, document_id, action, at) VALUES (?, ?, ?, ?, ?)",
            (user_id, article_id, document_id, action, utc_now().isoformat()),
        )


def audit_log(clearance: str | None, limit: int = 100) -> list[dict]:
    """Recent audited accesses. Titles above the viewer's own clearance are withheld (number only)."""
    visible, levels = visible_sql("k.classification", clearance)
    with connection() as conn:
        rows = conn.execute(
            f"""SELECT l.id, l.at, l.action, u.name AS user_name, u.email AS user_email, k.id AS article_id,
                       k.kb_number, k.classification, CASE WHEN {visible} THEN k.title END AS title,
                       d.file_name AS document_name
                FROM kb_access_log l
                JOIN users u ON u.id = l.user_id
                JOIN kb_articles k ON k.id = l.article_id
                LEFT JOIN article_documents d ON d.id = l.document_id
                ORDER BY l.id DESC LIMIT ?""",  # nosec B608
            (*levels, limit),
        ).fetchall()
    return [dict(r) for r in rows]
