import json
import sqlite3

from ..db import connection
from ..schemas import LearningPathSummary, NodeDetail, Runbook, RunbookRef, Subtopic


class KBService:
    def list_paths(self) -> list[LearningPathSummary]:
        with connection() as conn:
            rows = conn.execute("SELECT id, slug, title, description FROM learning_paths ORDER BY id").fetchall()
        return [LearningPathSummary(**dict(row)) for row in rows]

    def get_path(self, path_id: int) -> LearningPathSummary | None:
        with connection() as conn:
            row = conn.execute(
                "SELECT id, slug, title, description FROM learning_paths WHERE id = ?", (path_id,)
            ).fetchone()
        return LearningPathSummary(**dict(row)) if row else None

    def list_nodes_for_path(self, path_id: int) -> list[NodeDetail]:
        with connection() as conn:
            rows = conn.execute(
                "SELECT id, slug, title, description, content, dependencies, sample_question FROM nodes WHERE path_id = ? ORDER BY id",
                (path_id,),
            ).fetchall()
        return self._attach_related([self._row_to_node_detail(row) for row in rows])

    def get_node(self, node_id: int) -> NodeDetail | None:
        with connection() as conn:
            row = conn.execute(
                "SELECT id, slug, title, description, content, dependencies, sample_question FROM nodes WHERE id = ?",
                (node_id,),
            ).fetchone()
        return self._attach_related([self._row_to_node_detail(row)])[0] if row else None

    def search_content(self, path_id: int, query: str) -> list[NodeDetail]:
        with connection() as conn:
            rows = conn.execute(
                "SELECT id, slug, title, description, content, dependencies, sample_question FROM nodes WHERE path_id = ? AND content LIKE ? ORDER BY id",
                (path_id, f"%{query}%"),
            ).fetchall()
        return [self._row_to_node_detail(row) for row in rows]

    def get_context_documents(self, path_id: int) -> list[str]:
        nodes = self.list_nodes_for_path(path_id)
        return [node.content for node in nodes if node.content]

    def _parse_deps(self, deps: str | None) -> list[int]:
        if not deps:
            return []
        return [int(item.strip()) for item in deps.split(",") if item.strip()]

    def _row_to_node_detail(self, row: sqlite3.Row) -> NodeDetail:
        dependencies = self._parse_deps(row["dependencies"])
        return NodeDetail(
            id=row["id"],
            slug=row["slug"],
            title=row["title"],
            description=row["description"],
            content=row["content"],
            dependencies=dependencies,
            completed=False,
            locked=False,
            sample_question=row["sample_question"],
        )

    def _attach_related(self, nodes: list[NodeDetail]) -> list[NodeDetail]:
        """Add subtopics and related runbooks (both built from the dataset at startup)."""
        if not nodes:
            return nodes
        by_id = {node.id: node for node in nodes}
        placeholders = ",".join("?" * len(by_id))
        ids = tuple(by_id)
        with connection() as conn:
            # Only "?" placeholders are interpolated; the ids are bound parameters.
            subtopics = conn.execute(
                f"SELECT node_id, position, title, summary FROM node_subtopics WHERE node_id IN ({placeholders}) "  # nosec B608
                "ORDER BY node_id, position",
                ids,
            ).fetchall()
            runbooks = conn.execute(
                "SELECT nr.node_id, r.id, r.slug, r.title, r.category FROM node_runbooks nr "
                f"JOIN runbooks r ON r.id = nr.runbook_id WHERE nr.node_id IN ({placeholders}) "  # nosec B608
                "ORDER BY nr.node_id, nr.position",
                ids,
            ).fetchall()
        for row in subtopics:
            by_id[row["node_id"]].subtopics.append(
                Subtopic(id=f"{row['node_id']}-{row['position']}", title=row["title"], summary=row["summary"])
            )
        for row in runbooks:
            by_id[row["node_id"]].runbooks.append(
                RunbookRef(id=row["id"], slug=row["slug"], title=row["title"], category=row["category"])
            )
        return nodes

    # ── Runbooks ────────────────────────────────────────────

    def list_runbooks(self) -> list[Runbook]:
        with connection() as conn:
            rows = conn.execute("SELECT * FROM runbooks ORDER BY id").fetchall()
            links = conn.execute("SELECT node_id, runbook_id FROM node_runbooks ORDER BY node_id").fetchall()
        node_ids: dict[int, list[int]] = {}
        for link in links:
            node_ids.setdefault(link["runbook_id"], []).append(link["node_id"])
        return [self._row_to_runbook(row, node_ids.get(row["id"], [])) for row in rows]

    def get_runbook(self, runbook_id: int) -> Runbook | None:
        with connection() as conn:
            row = conn.execute("SELECT * FROM runbooks WHERE id = ?", (runbook_id,)).fetchone()
            links = conn.execute(
                "SELECT node_id FROM node_runbooks WHERE runbook_id = ? ORDER BY node_id", (runbook_id,)
            ).fetchall()
        return self._row_to_runbook(row, [link["node_id"] for link in links]) if row else None

    @staticmethod
    def _row_to_runbook(row: sqlite3.Row, node_ids: list[int]) -> Runbook:
        return Runbook(
            id=row["id"],
            slug=row["slug"],
            title=row["title"],
            category=row["category"],
            version=row["version"],
            updated=row["updated"],
            description=row["description"],
            preconditions=json.loads(row["preconditions"]),
            steps=json.loads(row["steps"]),
            escalation_triggers=json.loads(row["escalation_triggers"]),
            node_ids=node_ids,
        )
