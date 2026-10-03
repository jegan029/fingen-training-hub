"""Knowledge Library API (ServiceNow articles). Every query is limited to the caller's clearance.

Anything the caller may not see answers exactly like something that does not exist (404), so the API
never confirms that a hidden article, application or document exists.
"""

from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..config import KB_DOCUMENTS_DIR
from ..db import connection, utc_now
from ..integrations.servicenow.documents import stored_path
from ..schemas import (
    ApplicationDetail,
    ApplicationSummary,
    ArticleDetail,
    ArticleKind,
    ArticleLookup,
    ArticlePage,
    KnowledgeStatus,
)
from ..security import CurrentUser, get_current_user
from ..services import knowledge_service as ks
from ..services.classification import Level

router = APIRouter()


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} not found")


@router.get("/articles", response_model=ArticlePage)
def list_articles(
    q: str = Query("", max_length=100),
    classification: Level | None = None,
    app_number: str | None = Query(None, max_length=40),
    application_id: int | None = None,
    article_type: ArticleKind | None = Query(None, description="runbook, sop or other"),
    category: str | None = Query(None, max_length=200),
    node_id: int | None = None,
    sort: Literal["updated", "title"] = "updated",
    order: Literal["asc", "desc"] | None = None,
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(20, ge=1, le=50),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    return ks.list_articles(
        user.max_classification,
        q=q,
        classification=classification,
        app_number=app_number,
        application_id=application_id,
        article_type=article_type,
        category=category,
        node_id=node_id,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )


@router.get("/articles/by-number/{kb_number}", response_model=ArticleLookup)
def article_by_number(kb_number: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    """Resolves the /knowledge/kb/KB0012345 links that synced article bodies use."""
    article_id = ks.article_id_by_number(kb_number[:20], user.max_classification)
    if article_id is None:
        raise _not_found("Article")
    return {"id": article_id}


@router.get("/articles/{article_id}", response_model=ArticleDetail)
def get_article(article_id: int, request: Request, user: CurrentUser = Depends(get_current_user)) -> dict:
    ceiling = request.app.state.servicenow.settings.llm_max_classification
    detail = ks.article_detail(article_id, user.max_classification, ceiling)
    if detail is None:
        raise _not_found("Article")
    ks.record_access(user.id, article_id, detail["classification"], "view")
    return detail


@router.get("/applications", response_model=list[ApplicationSummary])
def list_applications(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return ks.list_applications(user.max_classification)


@router.get("/applications/{application_id}", response_model=ApplicationDetail)
def get_application(application_id: int, user: CurrentUser = Depends(get_current_user)) -> dict:
    detail = ks.application_detail(application_id, user.max_classification)
    if detail is None:
        raise _not_found("Application")
    return detail


@router.get("/documents/{document_id}/download")
def download_document(document_id: int, user: CurrentUser = Depends(get_current_user)) -> FileResponse:
    """Streams a stored attachment through the backend after the access check (never a redirect)."""
    doc = ks.document_for_download(document_id, user.max_classification)
    if doc is None:
        raise _not_found("Document")
    try:
        path = stored_path(KB_DOCUMENTS_DIR, doc["storage_path"])
    except ValueError:  # not a sha256 name: refused before touching the file system
        raise _not_found("Document") from None
    if not path.is_file():
        raise _not_found("Document")
    ks.record_access(user.id, doc["article_id"], doc["classification"], "download", document_id=doc["id"])
    return FileResponse(
        path,
        media_type=doc["content_type"],
        filename=doc["file_name"],
        content_disposition_type="attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/status", response_model=KnowledgeStatus)
def knowledge_status(request: Request) -> dict:
    settings = request.app.state.servicenow.settings
    with connection() as conn:
        success = conn.execute(
            "SELECT MAX(finished_at) FROM sync_runs WHERE status IN ('success', 'partial')"
        ).fetchone()[0]
        last = conn.execute(
            "SELECT status FROM sync_runs WHERE status != 'running' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    stale = success is None or datetime.fromisoformat(success) < utc_now() - timedelta(hours=settings.stale_hours)
    return {
        "enabled": settings.enabled,
        "stale": settings.enabled and stale,
        "unreachable": bool(last and last["status"] == "failed"),
        "last_success_at": success,
    }
