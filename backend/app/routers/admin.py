from fastapi import APIRouter, HTTPException, Query, Request

from ..config import logger
from ..db import connection
from ..schemas import ClearanceUpdate, WeakTopic
from ..security import limiter

router = APIRouter()


@router.get("/weakest-topics", response_model=list[WeakTopic])
def weakest_topics(limit: int = Query(10, ge=1, le=30)) -> list:
    """Nodes with the lowest average open ended score across learners, with scenario accuracy alongside."""
    with connection() as conn:
        rows = conn.execute(
            """SELECT n.id AS node_id, n.title, n.path_id, p.title AS path_title,
                      a.avg_score, a.attempts, a.learners,
                      s.scenario_attempts, s.scenario_correct
               FROM (SELECT node_id, ROUND(AVG(score), 1) AS avg_score, COUNT(1) AS attempts,
                            COUNT(DISTINCT user_id) AS learners
                     FROM assessments WHERE category != 'Unavailable' GROUP BY node_id) a
               JOIN nodes n ON n.id = a.node_id
               JOIN learning_paths p ON p.id = n.path_id
               LEFT JOIN (SELECT node_id, COUNT(1) AS scenario_attempts, SUM(is_correct) AS scenario_correct
                          FROM scenario_assessments GROUP BY node_id) s ON s.node_id = n.id
               ORDER BY a.avg_score ASC, a.attempts DESC, n.id
               LIMIT ?""",
            (limit,),
        ).fetchall()
    return [
        {
            "node_id": r["node_id"],
            "title": r["title"],
            "path_id": r["path_id"],
            "path_title": r["path_title"],
            "average_score": r["avg_score"],
            "attempts": r["attempts"],
            "learners": r["learners"],
            "scenario_attempts": r["scenario_attempts"] or 0,
            "scenario_correct_rate": round(100 * r["scenario_correct"] / r["scenario_attempts"])
            if r["scenario_attempts"]
            else None,
        }
        for r in rows
    ]


@router.get("/users")
def list_admin_users() -> list:
    with connection() as conn:
        paths = conn.execute("SELECT id, title FROM learning_paths ORDER BY id").fetchall()
        path_totals = {
            row["id"]: conn.execute("SELECT COUNT(1) as c FROM nodes WHERE path_id = ?", (row["id"],)).fetchone()["c"]
            for row in paths
        }

        users = conn.execute("SELECT id, name, email, role, max_classification FROM users ORDER BY id").fetchall()

        result = []
        for user in users:
            uid = user["id"]

            last_row = conn.execute(
                "SELECT MAX(updated_at) as la FROM progress WHERE user_id = ? AND status != 'pending'",
                (uid,),
            ).fetchone()
            last_active = last_row["la"] if last_row else None

            path_data = []
            total_completed = 0
            total_nodes = 0
            for path in paths:
                pid = path["id"]
                total = path_totals[pid]
                done = conn.execute(
                    """SELECT COUNT(1) as c FROM progress p
                       JOIN nodes n ON n.id = p.node_id
                       WHERE p.user_id = ? AND n.path_id = ? AND p.status = 'done'""",
                    (uid, pid),
                ).fetchone()["c"]
                pct = round((done / total) * 100) if total else 0
                path_data.append(
                    {
                        "path_id": pid,
                        "title": path["title"],
                        "completed": done,
                        "total": total,
                        "pct": pct,
                    }
                )
                total_completed += done
                total_nodes += total

            overall_pct = round((total_completed / total_nodes) * 100) if total_nodes else 0

            result.append(
                {
                    "id": uid,
                    "name": user["name"],
                    "email": user["email"],
                    "role": user["role"],
                    "max_classification": user["max_classification"],
                    "last_active": last_active,
                    "paths": path_data,
                    "overall_pct": overall_pct,
                }
            )

    return result


@router.put("/users/{user_id}/clearance")
@limiter.limit("30/minute")
def set_clearance(request: Request, user_id: int, payload: ClearanceUpdate) -> dict:
    """Set the highest classification a user may read. Takes effect on their next request."""
    with connection() as conn:
        cur = conn.execute(
            "UPDATE users SET max_classification = ? WHERE id = ?", (payload.max_classification, user_id)
        )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")
    logger.info("Admin %s set user %s clearance to %s", request.state.user.id, user_id, payload.max_classification)
    return {"id": user_id, "max_classification": payload.max_classification}
