from fastapi import APIRouter, HTTPException

from ..db import connection
from ..services.kb_service import KBService

router = APIRouter()
kb_service = KBService()


@router.get("/path/{path_id}")
def analytics_for_path(path_id: int) -> dict:
    """Path-level stats across all learners (admin only)."""
    path = kb_service.get_path(path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Learning path not found")
    with connection() as conn:
        learners = conn.execute("SELECT COUNT(1) AS c FROM users WHERE role = 'learner'").fetchone()["c"]
        total_nodes = conn.execute("SELECT COUNT(1) AS c FROM nodes WHERE path_id = ?", (path_id,)).fetchone()["c"]
        completed = conn.execute(
            """SELECT COUNT(1) AS c FROM progress p
               JOIN nodes n ON n.id = p.node_id
               JOIN users u ON u.id = p.user_id
               WHERE n.path_id = ? AND p.status = 'done' AND u.role = 'learner'""",
            (path_id,),
        ).fetchone()["c"]
        row = conn.execute(
            "SELECT AVG(score) AS avg_score FROM assessments JOIN nodes ON assessments.node_id = nodes.id WHERE nodes.path_id = ?",
            (path_id,),
        ).fetchone()
    possible = learners * total_nodes
    # Averages across all learners: average nodes completed per learner, and overall completion rate.
    return {
        "path_id": path_id,
        "completed_nodes": round(completed / learners) if learners else 0,
        "total_nodes": total_nodes,
        "completion_rate": round((completed / possible) * 100, 1) if possible else 0.0,
        "average_score": float(row["avg_score"] or 0.0),
        "learners": learners,
    }
