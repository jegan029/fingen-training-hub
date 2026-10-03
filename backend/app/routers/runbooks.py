from fastapi import APIRouter, Depends, HTTPException

from ..schemas import Runbook
from ..security import CurrentUser, get_current_user
from ..services.kb_service import KBService

router = APIRouter()
kb_service = KBService()


@router.get("/", response_model=list[Runbook])
def list_runbooks(user: CurrentUser = Depends(get_current_user)) -> list[Runbook]:
    return kb_service.list_runbooks(user.max_classification)


@router.get("/{runbook_id}", response_model=Runbook)
def get_runbook(runbook_id: int, user: CurrentUser = Depends(get_current_user)) -> Runbook:
    runbook = kb_service.get_runbook(runbook_id, user.max_classification)
    if not runbook:  # hidden and missing look the same (no confirmation that it exists)
        raise HTTPException(status_code=404, detail="Runbook not found")
    return runbook
