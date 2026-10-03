"""ServiceNow administration (admin only, mounted with require_admin). Nothing here returns secrets."""

from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from ..db import connection
from ..integrations.servicenow.scheduler import next_run_times
from ..integrations.servicenow.sync import SyncEngine, SyncInProgress
from ..schemas import AccessLogEntry, NodeLinkResult, ServiceNowStatus, SyncRun, SyncStarted
from ..security import CurrentUser, limiter, require_admin
from ..services.knowledge_service import audit_log, get_visible_article

router = APIRouter()

_RUN_COLUMNS = (
    "id, started_at, finished_at, mode, trigger, status, articles_seen, articles_created, articles_updated, "
    "articles_unchanged, articles_retired, articles_failed, documents_downloaded, documents_rejected, error_summary"
)


def _engine(request: Request) -> SyncEngine:
    engine = request.app.state.servicenow_sync
    if engine is None:
        raise HTTPException(status_code=409, detail="The ServiceNow integration is disabled")
    return engine


@router.get("/status", response_model=ServiceNowStatus)
def status(request: Request) -> dict:
    settings = request.app.state.servicenow.settings
    scheduler = request.app.state.servicenow_scheduler
    with connection() as conn:
        last = conn.execute(f"SELECT {_RUN_COLUMNS} FROM sync_runs ORDER BY id DESC LIMIT 1").fetchone()  # nosec B608
        success = conn.execute(
            "SELECT MAX(finished_at) FROM sync_runs WHERE status IN ('success', 'partial')"
        ).fetchone()[0]
        running = conn.execute("SELECT 1 FROM sync_runs WHERE status = 'running'").fetchone() is not None
        by_level = dict(
            conn.execute(
                "SELECT classification, COUNT(1) FROM kb_articles WHERE active = 1 GROUP BY classification"
            ).fetchall()
        )
        active, inactive = conn.execute(
            "SELECT COALESCE(SUM(active = 1), 0), COALESCE(SUM(active = 0), 0) FROM kb_articles"
        ).fetchone()
        apps = conn.execute("SELECT COUNT(1) FROM applications WHERE active = 1").fetchone()[0]
        docs = conn.execute("SELECT COUNT(1) FROM article_documents WHERE kind = 'attachment'").fetchone()[0]
    times = next_run_times(scheduler)
    host = urlsplit(settings.instance_url).hostname if settings.instance_url and not settings.mock_mode else None
    return {
        "enabled": settings.enabled,
        "mock_mode": settings.mock_mode,
        "auth_mode": settings.auth_mode,
        "instance_host": host,
        "scheduler_running": scheduler is not None and scheduler.running,
        "sync_interval_minutes": settings.sync_interval_minutes,
        "running": running,
        "last_run": dict(last) if last else None,
        "last_success_at": success,
        "next_incremental": times["incremental"],
        "next_full": times["full"],
        "counts": {
            "articles_active": active,
            "articles_inactive": inactive,
            "by_classification": by_level,
            "applications": apps,
            "documents": docs,
        },
    }


@router.post("/sync", response_model=SyncStarted, status_code=202)
@limiter.limit("6/minute")
def start_sync(
    request: Request,
    background: BackgroundTasks,
    mode: Literal["incremental", "full"] = "incremental",
) -> dict:
    """Start a sync in the background; poll /runs/{id}. 409 while another run is in progress."""
    engine = _engine(request)
    try:
        handle = engine.begin(mode, trigger="manual")
    except SyncInProgress:
        raise HTTPException(status_code=409, detail="A sync is already running") from None
    background.add_task(engine.execute, handle)
    return {"run_id": handle.run_id, "mode": mode}


@router.get("/runs", response_model=list[SyncRun])
def list_runs(limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(f"SELECT {_RUN_COLUMNS} FROM sync_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()  # nosec B608
    return [dict(r) for r in rows]


@router.get("/runs/{run_id}", response_model=SyncRun)
def get_run(run_id: int) -> dict:
    with connection() as conn:
        row = conn.execute(f"SELECT {_RUN_COLUMNS} FROM sync_runs WHERE id = ?", (run_id,)).fetchone()  # nosec B608
    if row is None:
        raise HTTPException(status_code=404, detail="Sync run not found")
    return dict(row)


@router.get("/mapping")
def get_mapping(request: Request) -> dict:
    """The active field mapping, read only. It holds field names and filters, never credentials."""
    mapping = request.app.state.servicenow.mapping
    if mapping is None:
        raise HTTPException(status_code=409, detail="The ServiceNow integration is disabled")
    return mapping.model_dump(mode="json")


@router.get("/audit", response_model=list[AccessLogEntry])
def access_audit(limit: int = Query(100, ge=1, le=500), user: CurrentUser = Depends(require_admin)) -> list[dict]:
    """Who viewed or downloaded confidential and restricted content, newest first."""
    return audit_log(user.max_classification, limit)


def _check_link_target(article_id: int, node_id: int, user: CurrentUser) -> None:
    # The admin's own clearance applies: no linking of articles they cannot see.
    if get_visible_article(article_id, user.max_classification) is None:
        raise HTTPException(status_code=404, detail="Article not found")
    with connection() as conn:
        if conn.execute("SELECT 1 FROM nodes WHERE id = ?", (node_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Node not found")


@router.post("/articles/{article_id}/nodes/{node_id}", response_model=NodeLinkResult)
@limiter.limit("60/minute")
def link_node(request: Request, article_id: int, node_id: int, user: CurrentUser = Depends(require_admin)) -> dict:
    _check_link_target(article_id, node_id, user)
    with connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO article_nodes (article_id, node_id, origin) VALUES (?, ?, 'manual')",
            (article_id, node_id),
        )
    return {"article_id": article_id, "node_id": node_id, "linked": True}


@router.delete("/articles/{article_id}/nodes/{node_id}", response_model=NodeLinkResult)
@limiter.limit("60/minute")
def unlink_node(request: Request, article_id: int, node_id: int, user: CurrentUser = Depends(require_admin)) -> dict:
    """Removes a manual link. Links from mapping.yaml come back on the next sync; change the mapping instead."""
    _check_link_target(article_id, node_id, user)
    with connection() as conn:
        conn.execute(
            "DELETE FROM article_nodes WHERE article_id = ? AND node_id = ? AND origin = 'manual'",
            (article_id, node_id),
        )
    return {"article_id": article_id, "node_id": node_id, "linked": False}
