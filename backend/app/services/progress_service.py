from collections.abc import Iterable, Mapping
from datetime import date, timedelta

from ..db import connection, utc_now
from ..schemas import NodeSummary, Prerequisite

STATUSES = ("pending", "in_progress", "done", "skipped")
# Statuses that satisfy a dependency. Skipped unlocks later nodes but does not count as done.
SATISFIES_DEPENDENCY = {"done", "skipped"}


def current_streak(active_days: Iterable[date], today: date) -> int:
    """Consecutive active days ending today, or yesterday (a streak survives until a full day is missed)."""
    days = set(active_days)
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


class ProgressService:
    def get_statuses(self, user_id: int) -> dict[int, str]:
        """Status per node for a user; nodes without a row are pending."""
        with connection() as conn:
            rows = conn.execute("SELECT node_id, status FROM progress WHERE user_id = ?", (user_id,)).fetchall()
        return {row["node_id"]: row["status"] for row in rows}

    def set_status(self, user_id: int, node_id: int, status: str) -> None:
        if status not in STATUSES:
            raise ValueError(f"Unknown status: {status}")
        with connection() as conn:
            conn.execute(
                """INSERT INTO progress (user_id, node_id, status, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(user_id, node_id) DO UPDATE SET status = excluded.status,
                       updated_at = excluded.updated_at""",
                (user_id, node_id, status),
            )

    def get_path_progress(self, user_id: int, path_id: int) -> dict[str, float]:
        with connection() as conn:
            total = conn.execute("SELECT COUNT(1) AS c FROM nodes WHERE path_id = ?", (path_id,)).fetchone()["c"]
            rows = conn.execute(
                """SELECT p.status, COUNT(1) AS c FROM progress p JOIN nodes n ON n.id = p.node_id
                   WHERE p.user_id = ? AND n.path_id = ? GROUP BY p.status""",
                (user_id, path_id),
            ).fetchall()
        counts = {row["status"]: row["c"] for row in rows}
        done = counts.get("done", 0)
        return {
            "completed": done,
            "in_progress": counts.get("in_progress", 0),
            "skipped": counts.get("skipped", 0),
            "total": total,
            "completion_rate": round((done / total) * 100, 1) if total else 0.0,
        }

    def annotate_nodes(self, user_id: int, node_list: list[NodeSummary]) -> list[NodeSummary]:
        """Fill status, completed, locked and locked_by for the user."""
        statuses = self.get_statuses(user_id)
        deps = self._dependency_info(node_list)
        for node in node_list:
            node.status = statuses.get(node.id, "pending")
            node.completed = node.status == "done"
            blockers = self.blocking_dependencies(node, statuses)
            node.locked = bool(blockers)
            node.locked_by = [deps[dep]["title"] for dep in blockers if dep in deps]
            node.prerequisites = [
                Prerequisite(
                    id=dep, title=deps[dep]["title"], path_id=deps[dep]["path_id"], status=statuses.get(dep, "pending")
                )
                for dep in node.dependencies
                if dep in deps
            ]
        return node_list

    def summary(self, user_id: int) -> dict:
        """Activity streak and the node to continue with, for the home page."""
        with connection() as conn:
            # Timestamps are stored in UTC, either as "YYYY-MM-DD HH:MM:SS" or ISO 8601; the date is the first 10 chars.
            days = conn.execute(
                """SELECT DISTINCT substr(updated_at, 1, 10) AS d FROM progress WHERE user_id = :u AND status != 'pending'
                   UNION SELECT DISTINCT substr(created_at, 1, 10) FROM assessments WHERE user_id = :u
                   UNION SELECT DISTINCT substr(created_at, 1, 10) FROM scenario_assessments WHERE user_id = :u""",
                {"u": user_id},
            ).fetchall()
        active_days = {date.fromisoformat(row["d"]) for row in days if row["d"]}
        return {
            "streak_days": current_streak(active_days, utc_now().date()),
            "last_active": max(active_days).isoformat() if active_days else None,
            "continue_node": self._continue_node(user_id),
        }

    def _continue_node(self, user_id: int) -> dict | None:
        """The most recent in progress node, otherwise the next open node in the most recently active path."""
        statuses = self.get_statuses(user_id)
        with connection() as conn:
            nodes = conn.execute(
                """SELECT n.id, n.title, n.dependencies, n.path_id, p.title AS path_title
                   FROM nodes n JOIN learning_paths p ON p.id = n.path_id ORDER BY n.path_id, n.id"""
            ).fetchall()
            recent = conn.execute(
                """SELECT p.node_id, p.status, n.path_id FROM progress p JOIN nodes n ON n.id = p.node_id
                   WHERE p.user_id = ? AND p.status != 'pending' ORDER BY p.updated_at DESC, p.id DESC""",
                (user_id,),
            ).fetchall()

        by_id = {row["id"]: row for row in nodes}

        def payload(row, reason: str) -> dict:
            return {
                "node_id": row["id"],
                "title": row["title"],
                "path_id": row["path_id"],
                "path_title": row["path_title"],
                "status": statuses.get(row["id"], "pending"),
                "reason": reason,
            }

        for row in recent:
            if row["status"] == "in_progress" and row["node_id"] in by_id:
                return payload(by_id[row["node_id"]], "in_progress")

        def is_open(row) -> bool:
            if statuses.get(row["id"], "pending") != "pending":
                return False
            deps = [int(d) for d in (row["dependencies"] or "").split(",") if d.strip()]
            return all(statuses.get(d, "pending") in SATISFIES_DEPENDENCY for d in deps)

        # Prefer the path the learner touched last, then the others in order.
        recent_path = recent[0]["path_id"] if recent else None
        ordered = sorted(nodes, key=lambda r: (r["path_id"] != recent_path, r["path_id"], r["id"]))
        for row in ordered:
            if is_open(row):
                return payload(row, "next" if recent else "start")
        return None

    @staticmethod
    def blocking_dependencies(node: NodeSummary, statuses: Mapping[int, str]) -> list[int]:
        """Dependencies not yet done or skipped; the node is locked while this is non-empty."""
        return [dep for dep in node.dependencies if statuses.get(dep, "pending") not in SATISFIES_DEPENDENCY]

    @staticmethod
    def _dependency_info(node_list: list[NodeSummary]) -> dict[int, dict]:
        """Title and path of every dependency, including ones in other paths."""
        ids = {dep for node in node_list for dep in node.dependencies}
        if not ids:
            return {}
        placeholders = ",".join("?" * len(ids))
        with connection() as conn:
            # Only "?" placeholders are interpolated; the ids are bound parameters.
            sql = f"SELECT id, title, path_id FROM nodes WHERE id IN ({placeholders})"  # nosec B608
            rows = conn.execute(sql, tuple(ids)).fetchall()
        return {row["id"]: {"title": row["title"], "path_id": row["path_id"]} for row in rows}
