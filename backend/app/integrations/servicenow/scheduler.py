"""Background sync schedule, run inside the API process.

Why in process (APScheduler BackgroundScheduler) and not a separate worker: the app is deployed as one
uvicorn process on SQLite (see docker-compose.yml). A worker would need its own container, a shared
volume and cross process locking for no gain at this scale. If more API workers are ever added, the
sync_runs "running" guard in SyncEngine.begin still keeps runs from overlapping.
"""

import logging
import os
from datetime import timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ...db import utc_now
from .sync import SyncEngine, SyncInProgress

log = logging.getLogger("fingen.servicenow.scheduler")
FIRST_RUN_DELAY = timedelta(seconds=15)


def scheduler_enabled() -> bool:
    # Tests and one off scripts set SERVICENOW_SCHEDULER=false; manual syncs still work.
    return os.getenv("SERVICENOW_SCHEDULER", "true").strip().lower() not in ("false", "0", "no", "off")


def _job(engine: SyncEngine, mode: str) -> None:
    try:
        engine.run(mode, trigger="schedule")
    except SyncInProgress:
        log.info("Scheduled %s sync skipped: another run is in progress", mode)
    except Exception:  # the scheduler thread must survive anything
        log.exception("Scheduled %s sync could not start", mode)


def start_scheduler(engine: SyncEngine) -> BackgroundScheduler:
    settings = engine.config.settings
    scheduler = BackgroundScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 300},
    )
    # The first incremental run soon after startup, then on the interval.
    scheduler.add_job(
        _job,
        IntervalTrigger(minutes=settings.sync_interval_minutes),
        args=(engine, "incremental"),
        id="servicenow-incremental",
        next_run_time=utc_now() + FIRST_RUN_DELAY,
    )
    scheduler.add_job(
        _job,
        CronTrigger(hour=settings.full_sync_hour, minute=0),
        args=(engine, "full"),
        id="servicenow-full",
    )
    scheduler.start()
    return scheduler


def next_run_times(scheduler: BackgroundScheduler | None) -> dict[str, str | None]:
    if scheduler is None:
        return {"incremental": None, "full": None}
    result = {}
    for mode in ("incremental", "full"):
        job = scheduler.get_job(f"servicenow-{mode}")
        result[mode] = job.next_run_time.isoformat() if job and job.next_run_time else None
    return result
