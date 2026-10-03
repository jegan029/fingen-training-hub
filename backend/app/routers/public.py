"""Unauthenticated endpoints for the sign in page. Keep this tiny: aggregate counts only, never user data
or anything about synced or classified ServiceNow content."""

import time

from fastapi import APIRouter, Request, Response

from ..db import connection
from ..schemas import PublicStats
from ..security import limiter

router = APIRouter()

CACHE_SECONDS = 600
_cache: tuple[float, PublicStats] | None = None


def _counts() -> PublicStats:
    with connection() as conn:
        paths = conn.execute("SELECT COUNT(*) FROM learning_paths").fetchone()[0]
        lessons = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        # Dataset runbooks only: synced ServiceNow runbooks carry classifications and are not counted here.
        runbooks = conn.execute("SELECT COUNT(*) FROM runbooks WHERE source = 'local'").fetchone()[0]
    return PublicStats(paths=paths, lessons=lessons, runbooks=runbooks)


def reset_cache() -> None:
    global _cache
    _cache = None


@router.get("/stats", response_model=PublicStats)
@limiter.limit("30/minute")
def public_stats(request: Request, response: Response) -> PublicStats:
    global _cache
    now = time.monotonic()
    if _cache is None or now - _cache[0] > CACHE_SECONDS:
        _cache = (now, _counts())
    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    return _cache[1]
