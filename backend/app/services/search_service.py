from ..db import connection
from .classification import visible_sql_named
from .kb_service import RUNBOOK_LIVE

MIN_QUERY = 2
MAX_QUERY = 100
PER_KIND = 6


def _like(query: str) -> str:
    """LIKE pattern that matches the query literally (%, _ and \\ are escaped)."""
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class SearchService:
    """Search for the command palette: paths, nodes, subtopics, runbooks and (within clearance) knowledge."""

    def search(self, query: str, clearance: str | None) -> list[dict]:
        query = " ".join(query.split())
        if len(query) < MIN_QUERY:
            return []
        pattern = _like(query[:MAX_QUERY])
        with connection() as conn:
            paths = conn.execute(
                """SELECT id, title, description FROM learning_paths
                   WHERE title LIKE :q ESCAPE '\\' OR description LIKE :q ESCAPE '\\'
                   ORDER BY title LIKE :q ESCAPE '\\' DESC, id LIMIT :n""",
                {"q": pattern, "n": PER_KIND},
            ).fetchall()
            nodes = conn.execute(
                """SELECT n.id, n.title, n.description, n.path_id, p.title AS path_title
                   FROM nodes n JOIN learning_paths p ON p.id = n.path_id
                   WHERE n.title LIKE :q ESCAPE '\\' OR n.description LIKE :q ESCAPE '\\'
                   ORDER BY n.title LIKE :q ESCAPE '\\' DESC, n.id LIMIT :n""",
                {"q": pattern, "n": PER_KIND},
            ).fetchall()
            subtopics = conn.execute(
                """SELECT s.node_id, s.position, s.title, n.title AS node_title, n.path_id
                   FROM node_subtopics s JOIN nodes n ON n.id = s.node_id
                   WHERE s.title LIKE :q ESCAPE '\\'
                   ORDER BY s.node_id, s.position LIMIT :n""",
                {"q": pattern, "n": PER_KIND},
            ).fetchall()
            visible, levels = visible_sql_named("r.classification", clearance)
            # Only the level condition is interpolated; its values are bound parameters.
            runbooks = conn.execute(
                f"""SELECT r.id, r.title, r.category, r.kb_article_id FROM runbooks r
                   WHERE (r.title LIKE :q ESCAPE '\\' OR r.description LIKE :q ESCAPE '\\'
                          OR r.category LIKE :q ESCAPE '\\')
                     AND {visible} AND {RUNBOOK_LIVE}
                   ORDER BY r.title LIKE :q ESCAPE '\\' DESC, r.id LIMIT :n""",  # nosec B608
                {"q": pattern, "n": PER_KIND, **levels},
            ).fetchall()
            visible_k, levels_k = visible_sql_named("k.classification", clearance)
            live = f"k.active = 1 AND {visible_k}"
            articles = conn.execute(
                f"""SELECT k.id, k.kb_number, k.title FROM kb_articles k
                   WHERE (k.title LIKE :q ESCAPE '\\' OR k.kb_number LIKE :q ESCAPE '\\'
                          OR k.summary LIKE :q ESCAPE '\\') AND {live}
                     AND NOT EXISTS (SELECT 1 FROM runbooks r WHERE r.kb_article_id = k.id)
                   ORDER BY k.title LIKE :q ESCAPE '\\' DESC, k.id LIMIT :n""",  # nosec B608
                {"q": pattern, "n": PER_KIND, **levels_k},
            ).fetchall()
            # Only applications with at least one article this user can see.
            applications = conn.execute(
                f"""SELECT DISTINCT a.id, a.app_number, a.name FROM applications a
                   JOIN article_applications aa ON aa.application_id = a.id JOIN kb_articles k ON k.id = aa.article_id
                   WHERE (a.name LIKE :q ESCAPE '\\' OR a.app_number LIKE :q ESCAPE '\\') AND a.active = 1 AND {live}
                   ORDER BY a.app_number LIMIT :n""",  # nosec B608
                {"q": pattern, "n": PER_KIND, **levels_k},
            ).fetchall()
            documents = conn.execute(
                f"""SELECT d.id, d.file_name, d.article_id, k.kb_number FROM article_documents d
                   JOIN kb_articles k ON k.id = d.article_id
                   WHERE d.kind = 'attachment' AND d.file_name LIKE :q ESCAPE '\\' AND {live}
                   ORDER BY d.file_name LIMIT :n""",  # nosec B608
                {"q": pattern, "n": PER_KIND, **levels_k},
            ).fetchall()

        results: list[dict] = []
        results += [
            {
                "kind": "path",
                "id": f"path-{r['id']}",
                "title": r["title"],
                "subtitle": "Training path",
                "url": f"/roadmaps/{r['id']}",
            }
            for r in paths
        ]
        results += [
            {
                "kind": "node",
                "id": f"node-{r['id']}",
                "title": r["title"],
                "subtitle": r["path_title"],
                "url": f"/roadmaps/{r['path_id']}?node={r['id']}",
            }
            for r in nodes
        ]
        results += [
            {
                "kind": "subtopic",
                "id": f"subtopic-{r['node_id']}-{r['position']}",
                "title": r["title"],
                "subtitle": r["node_title"],
                "url": f"/roadmaps/{r['path_id']}?node={r['node_id']}",
            }
            for r in subtopics
        ]
        results += [
            {
                "kind": "runbook",
                "id": f"runbook-{r['id']}",
                "title": r["title"],
                "subtitle": r["category"],
                # ServiceNow runbooks are read only articles: open the article page.
                "url": f"/knowledge/{r['kb_article_id']}" if r["kb_article_id"] else f"/runbooks?open={r['id']}",
            }
            for r in runbooks
        ]
        results += [
            {
                "kind": "article",
                "id": f"article-{r['id']}",
                "title": r["title"],
                "subtitle": r["kb_number"],
                "url": f"/knowledge/{r['id']}",
            }
            for r in articles
        ]
        results += [
            {
                "kind": "application",
                "id": f"application-{r['id']}",
                "title": r["name"],
                "subtitle": r["app_number"],
                "url": f"/applications/{r['id']}",
            }
            for r in applications
        ]
        results += [
            {
                "kind": "document",
                "id": f"document-{r['id']}",
                "title": r["file_name"],
                "subtitle": r["kb_number"],
                "url": f"/knowledge/{r['article_id']}",
            }
            for r in documents
        ]
        return results
