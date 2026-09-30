from fastapi import APIRouter, HTTPException

from ..schemas import Runbook
from ..services.kb_service import KBService

router = APIRouter()
kb_service = KBService()


@router.get("/", response_model=list[Runbook])
def list_runbooks() -> list[Runbook]:
    return kb_service.list_runbooks()


@router.get("/{runbook_id}", response_model=Runbook)
def get_runbook(runbook_id: int) -> Runbook:
    runbook = kb_service.get_runbook(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail="Runbook not found")
    return runbook
