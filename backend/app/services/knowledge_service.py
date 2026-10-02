"""Read access to synced knowledge articles. Every query filters by the caller's clearance in SQL."""

import sqlite3

from ..db import connection, utc_now
from .classification import AUDITED, visible_sql


def get_visible_article(article_id: int, clearance: str | None) -> sqlite3.Row | None:
    """The active article if this clearance may see it, otherwise None (whether hidden or missing)."""
    visible, levels = visible_sql("k.classification", clearance)
    with connection() as conn:
        return conn.execute(
            f"SELECT k.* FROM kb_articles k WHERE k.id = ? AND k.active = 1 AND {visible}",  # nosec B608
            (article_id, *levels),
        ).fetchone()


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
