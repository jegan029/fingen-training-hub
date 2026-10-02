from fastapi import APIRouter, Depends, Query

from ..schemas import AccessLogEntry
from ..security import CurrentUser, require_admin
from ..services.knowledge_service import audit_log

router = APIRouter()


@router.get("/audit", response_model=list[AccessLogEntry])
def access_audit(limit: int = Query(100, ge=1, le=500), user: CurrentUser = Depends(require_admin)) -> list[dict]:
    """Who viewed or downloaded confidential and restricted content, newest first."""
    return audit_log(user.max_classification, limit)
