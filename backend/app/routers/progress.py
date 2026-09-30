from fastapi import APIRouter, Depends, HTTPException

from ..db import connection
from ..schemas import NodeStatusUpdate, ProgressPayload, ProgressSummary
from ..security import CurrentUser, get_current_user
from ..services.kb_service import KBService
from ..services.progress_service import ProgressService

router = APIRouter()
progress_service = ProgressService()
kb_service = KBService()


def _set_node_status(user: CurrentUser, node_id: int, status: str) -> dict:
    node = kb_service.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node = progress_service.annotate_nodes(user.id, [node])[0]
    # Locked nodes stay readable, but only "pending" (reset) is allowed until prerequisites are met.
    if node.locked and status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Complete {', '.join(node.locked_by)} first",
        )
    progress_service.set_status(user.id, node_id, status)
    with connection() as conn:
        path_id = conn.execute("SELECT path_id FROM nodes WHERE id = ?", (node_id,)).fetchone()["path_id"]
    return {"node_id": node_id, "status": status, "progress": progress_service.get_path_progress(user.id, path_id)}


@router.put("/node/{node_id}")
def set_node_status(node_id: int, payload: NodeStatusUpdate, user: CurrentUser = Depends(get_current_user)) -> dict:
    return _set_node_status(user, node_id, payload.status)


@router.post("/complete")
def mark_complete(payload: ProgressPayload, user: CurrentUser = Depends(get_current_user)) -> dict:
    """Shortcut for status "done" (used by the lesson page)."""
    return _set_node_status(user, payload.node_id, "done")


@router.get("/path/{path_id}")
def get_path_status(path_id: int, user: CurrentUser = Depends(get_current_user)) -> dict:
    path = kb_service.get_path(path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Learning path not found")
    progress = progress_service.get_path_progress(user.id, path_id)
    return {"path_id": path_id, "progress": progress}


@router.get("/summary", response_model=ProgressSummary)
def get_progress_summary(user: CurrentUser = Depends(get_current_user)) -> dict:
    return progress_service.summary(user.id)


@router.get("/overview")
def get_progress_overview(user: CurrentUser = Depends(get_current_user)) -> dict:
    with connection() as conn:
        paths = conn.execute("SELECT id, title FROM learning_paths ORDER BY id").fetchall()

        path_summaries = []
        total_completed = 0
        total_nodes = 0

        for path in paths:
            pid = path["id"]
            total = conn.execute("SELECT COUNT(1) as c FROM nodes WHERE path_id = ?", (pid,)).fetchone()["c"]
            done = conn.execute(
                """SELECT COUNT(1) as c FROM progress p
                   JOIN nodes n ON n.id = p.node_id
                   WHERE p.user_id = ? AND n.path_id = ? AND p.status = 'done'""",
                (user.id, pid),
            ).fetchone()["c"]
            pct = round((done / total) * 100) if total else 0
            path_summaries.append(
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
    return {
        "user_id": user.id,
        "user_name": user.name,
        "paths": path_summaries,
        "overall_pct": overall_pct,
    }
