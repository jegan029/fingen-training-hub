from ..config import CERT_MIN_AVG_SCORE
from ..db import connection


class CertificateService:
    """Server side certificate eligibility: every node done and a high enough assessment average."""

    def status(self, user_id: int, user_name: str) -> dict:
        with connection() as conn:
            paths = conn.execute(
                """SELECT p.id, p.title, COUNT(n.id) AS total,
                          SUM(CASE WHEN pr.status = 'done' THEN 1 ELSE 0 END) AS done
                   FROM learning_paths p
                   JOIN nodes n ON n.path_id = p.id
                   LEFT JOIN progress pr ON pr.node_id = n.id AND pr.user_id = ?
                   GROUP BY p.id ORDER BY p.id""",
                (user_id,),
            ).fetchall()
            # Best score per node, so a retake can raise the average; failed (Unavailable) evaluations do not count.
            scores = conn.execute(
                """SELECT MAX(score) AS best FROM assessments
                   WHERE user_id = ? AND category != 'Unavailable' GROUP BY node_id""",
                (user_id,),
            ).fetchall()
            awarded = conn.execute(
                "SELECT MAX(updated_at) AS at FROM progress WHERE user_id = ? AND status = 'done'", (user_id,)
            ).fetchone()["at"]

        path_rows = [
            {"path_id": r["id"], "title": r["title"], "completed": r["done"] or 0, "total": r["total"]} for r in paths
        ]
        average: float | None = round(sum(r["best"] for r in scores) / len(scores), 1) if scores else None

        missing: list[str] = []
        for p in path_rows:
            if p["completed"] < p["total"]:
                left = p["total"] - p["completed"]
                missing.append(f"{p['title']}: {left} more {'topic' if left == 1 else 'topics'} to mark done")
        if average is None:
            missing.append("Complete at least one open ended assessment")
        elif average < CERT_MIN_AVG_SCORE:
            missing.append(f"Raise your assessment average from {average:g} to {CERT_MIN_AVG_SCORE:g} or more")

        eligible = not missing
        return {
            "eligible": eligible,
            "user_name": user_name,
            "awarded_on": awarded[:10] if eligible and awarded else None,
            "average_score": average,
            "assessed_nodes": len(scores),
            "min_average_score": CERT_MIN_AVG_SCORE,
            "paths": path_rows,
            "missing": missing,
        }
