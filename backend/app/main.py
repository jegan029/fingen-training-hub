import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import CORS_ORIGINS, IS_DEV, logger
from .db import init_db
from .integrations.servicenow.config import load_config as load_servicenow_config
from .integrations.servicenow.redaction import install_redaction
from .integrations.servicenow.scheduler import scheduler_enabled, start_scheduler
from .integrations.servicenow.sync import SyncEngine
from .routers import (
    admin,
    analytics,
    assessment,
    auth,
    certificate,
    chat,
    knowledge,
    progress,
    roadmap,
    runbooks,
    search,
    servicenow_admin,
)
from .security import (
    CSRF_HEADER,
    CSRFMiddleware,
    SecurityHeadersMiddleware,
    get_current_user,
    limiter,
    require_admin,
)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fails fast on an invalid ServiceNow mapping, before anything else starts.
    app.state.servicenow = load_servicenow_config()
    install_redaction(app.state.servicenow.settings.secrets())
    init_db()
    app.state.servicenow_sync = None
    app.state.servicenow_scheduler = None
    if app.state.servicenow.mapping is not None:
        SyncEngine.recover_interrupted()
        app.state.servicenow_sync = SyncEngine(app.state.servicenow)
        if scheduler_enabled():
            app.state.servicenow_scheduler = start_scheduler(app.state.servicenow_sync)
    try:
        yield
    finally:
        if app.state.servicenow_scheduler is not None:
            app.state.servicenow_scheduler.shutdown(wait=False)


app = FastAPI(
    title="FinGen Training Hub API",
    description="L2 support engineer onboarding platform for the Fingen platform.",
    version="1.0.0",
    lifespan=lifespan,
    # API docs are a development aid only.
    docs_url="/docs" if IS_DEV else None,
    redoc_url="/redoc" if IS_DEV else None,
    openapi_url="/openapi.json" if IS_DEV else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    # Log details server side; never echo internals (upstream URLs, SQL, stack traces) to clients.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


# Middleware order: last added runs first on the request.
app.add_middleware(CSRFMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", CSRF_HEADER],
)
app.add_middleware(SecurityHeadersMiddleware)

authenticated = [Depends(get_current_user)]
admin_only = [Depends(require_admin)]

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(roadmap.router, prefix="/api/roadmaps", tags=["Roadmaps"], dependencies=authenticated)
app.include_router(progress.router, prefix="/api/progress", tags=["Progress"], dependencies=authenticated)
app.include_router(assessment.router, prefix="/api/assessments", tags=["Assessments"], dependencies=authenticated)
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"], dependencies=authenticated)
app.include_router(runbooks.router, prefix="/api/runbooks", tags=["Runbooks"], dependencies=authenticated)
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge"], dependencies=authenticated)
app.include_router(search.router, prefix="/api/search", tags=["Search"], dependencies=authenticated)
app.include_router(certificate.router, prefix="/api/certificate", tags=["Certificate"], dependencies=authenticated)
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"], dependencies=admin_only)
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"], dependencies=admin_only)
app.include_router(
    servicenow_admin.router, prefix="/api/admin/servicenow", tags=["ServiceNow admin"], dependencies=admin_only
)


@app.get("/api/health")
def health_check() -> dict:
    return {"status": "ok"}
