from fastapi import APIRouter, Depends, HTTPException

from ..schemas import LearningPathSummary, NodeDetail, NodeSummary
from ..security import CurrentUser, get_current_user
from ..services.kb_service import KBService
from ..services.progress_service import ProgressService

router = APIRouter()
kb_service = KBService()
progress_service = ProgressService()


@router.get("/", response_model=list[LearningPathSummary])
def list_paths() -> list[LearningPathSummary]:
    return kb_service.list_paths()


@router.get("/{path_id}", response_model=list[NodeSummary])
def list_path_nodes(path_id: int, user: CurrentUser = Depends(get_current_user)) -> list[NodeSummary]:
    path = kb_service.get_path(path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Learning path not found")
    nodes = kb_service.list_nodes_for_path(path_id)
    return progress_service.annotate_nodes(user.id, nodes)


@router.get("/node/{node_id}", response_model=NodeDetail)
def get_node(node_id: int, user: CurrentUser = Depends(get_current_user)) -> NodeDetail:
    node = kb_service.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return progress_service.annotate_nodes(user.id, [node])[0]
