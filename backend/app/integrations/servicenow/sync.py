"""Sync ServiceNow knowledge articles into the Training Hub database (read only on the ServiceNow side).

Incremental runs fetch articles changed since the last successful watermark; full runs fetch the
whole filter and retire (never delete) articles that are gone, unpublished or expired. Articles are
keyed by KB number: a new version in ServiceNow is a new record (new sys_id) with the same number.

One run at a time: a process lock plus a "running" row in sync_runs (refused while one younger than
RUNNING_TTL exists), so a second worker process cannot start a parallel run either. One bad article
is logged, counted and skipped; it never fails the whole run.
"""

import hashlib
import json
import logging
import re
import sqlite3
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ...config import KB_DOCUMENTS_DIR
from ...db import RUNBOOK_ID_OFFSET, connection, utc_now
from ...services.prose import normalise_dashes
from .config import ServiceNowConfig
from .documents import MIME, DocumentRejected, expected_type, store, verify_content
from .errors import DocumentTooLarge, ServiceNowError
from .factory import build_client
from .mapping import FieldSpec, Mapping
from .processing import LinkContext, html_to_markdown, plain_text, summarise
from .redaction import redact
from .urls import check_sys_id

log = logging.getLogger("fingen.servicenow.sync")

RUNNING_TTL = timedelta(hours=2)
MAX_ERRORS = 20
_RUN_LOCK = threading.Lock()
_KB_NUMBER = re.compile(r"^[A-Z]{2,6}\d{4,12}$")
_APP_NUMBER = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
_CHUNK = 50


class SyncInProgress(Exception):
    """Another sync run is active."""


@dataclass
class App:
    number: str
    name: str
    description: str = ""
    sys_id: str | None = None


@dataclass
class Counts:
    seen: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    retired: int = 0
    failed: int = 0
    documents_downloaded: int = 0
    documents_rejected: int = 0


@dataclass
class RunHandle:
    run_id: int
    mode: str
    counts: Counts = field(default_factory=Counts)
    notes: list[str] = field(default_factory=list)


def _part(record: dict[str, Any], spec: FieldSpec | None, display: bool = False) -> str:
    """A field from a Table API record, whichever sysparm_display_value shape it came in."""
    if spec is None or spec.name not in record:
        return ""
    raw = record[spec.name]
    if isinstance(raw, dict):
        raw = raw.get("display_value" if display else "value")
    return "" if raw is None else str(raw)


def _value(record: dict[str, Any], spec: FieldSpec | None) -> str:
    return _part(record, spec, display=spec is not None and spec.read == "display")


def _display(record: dict[str, Any], spec: FieldSpec | None) -> str:
    return _part(record, spec, display=spec is not None and spec.read != "value") or _value(record, spec)


def _plain(raw: Any) -> str:
    if isinstance(raw, dict):
        raw = raw.get("value")
    return "" if raw is None else str(raw)


def _expired(valid_to: str, today: date) -> bool:
    try:
        return date.fromisoformat(valid_to[:10]) < today
    except ValueError:
        return False  # empty or unparseable: no expiry


class SyncEngine:
    def __init__(
        self,
        config: ServiceNowConfig,
        *,
        client_factory: Callable = build_client,
        documents_dir: Path | None = None,
        today: Callable[[], date] = lambda: utc_now().date(),
    ) -> None:
        if config.mapping is None:
            raise ValueError("The ServiceNow integration is disabled")
        self.config = config
        self.mapping: Mapping = config.mapping
        self.client_factory = client_factory
        self.documents_dir = documents_dir or KB_DOCUMENTS_DIR
        self.today = today
        self.max_bytes = config.settings.max_document_mb * 1024 * 1024

    # ── Run lifecycle ───────────────────────────────────────

    def begin(self, mode: str, trigger: str = "manual") -> RunHandle:
        """Claim the single run slot and record a running row; raises SyncInProgress."""
        if mode not in ("incremental", "full"):
            raise ValueError("mode must be incremental or full")
        if not _RUN_LOCK.acquire(blocking=False):
            raise SyncInProgress
        try:
            now = utc_now()
            with connection() as conn:
                cur = conn.execute(
                    """INSERT INTO sync_runs (started_at, mode, trigger, status)
                       SELECT ?, ?, ?, 'running'
                       WHERE NOT EXISTS (SELECT 1 FROM sync_runs WHERE status = 'running' AND started_at > ?)""",
                    (now.isoformat(), mode, trigger, (now - RUNNING_TTL).isoformat()),
                )
                if cur.rowcount == 0:
                    raise SyncInProgress
                return RunHandle(run_id=cur.lastrowid, mode=mode)
        except BaseException:
            _RUN_LOCK.release()
            raise

    def execute(self, run: RunHandle) -> str:
        """Run a claimed sync to completion; always records the outcome and frees the slot."""
        status, watermark, error = "failed", None, None
        try:
            watermark = self._execute(run)
            status = "partial" if run.counts.failed else "success"
        except ServiceNowError as exc:
            error = str(exc)
            log.warning("ServiceNow sync %s failed: %s", run.run_id, exc)
        except Exception as exc:  # never let a sync crash the scheduler or the request
            error = f"Unexpected error ({type(exc).__name__})"
            log.exception("ServiceNow sync %s failed", run.run_id)
        finally:
            try:
                self._finish(run, status, watermark, error)
            finally:
                _RUN_LOCK.release()
        return status

    def run(self, mode: str = "incremental", trigger: str = "manual") -> int:
        handle = self.begin(mode, trigger)
        self.execute(handle)
        return handle.run_id

    @staticmethod
    def recover_interrupted() -> None:
        """Runs left 'running' by a stopped process can never finish; close them at startup."""
        with connection() as conn:
            conn.execute(
                "UPDATE sync_runs SET status = 'failed', finished_at = ?, error_summary = 'Interrupted by a restart' "
                "WHERE status = 'running'",
                (utc_now().isoformat(),),
            )

    def _finish(self, run: RunHandle, status: str, watermark: str | None, error: str | None) -> None:
        c = run.counts
        notes = ([error] if error else []) + run.notes
        summary = "; ".join(notes[:MAX_ERRORS]) + (
            f"; and {len(notes) - MAX_ERRORS} more" if len(notes) > MAX_ERRORS else ""
        )
        summary = redact(summary, self.config.settings.secrets())[:2000] or None
        with connection() as conn:
            conn.execute(
                """UPDATE sync_runs SET finished_at = ?, status = ?, articles_seen = ?, articles_created = ?,
                       articles_updated = ?, articles_unchanged = ?, articles_retired = ?, articles_failed = ?,
                       documents_downloaded = ?, documents_rejected = ?, watermark = ?, error_summary = ?
                   WHERE id = ?""",
                (
                    utc_now().isoformat(),
                    status,
                    c.seen,
                    c.created,
                    c.updated,
                    c.unchanged,
                    c.retired,
                    c.failed,
                    c.documents_downloaded,
                    c.documents_rejected,
                    watermark if status != "failed" else None,
                    summary,
                    run.run_id,
                ),
            )

    @staticmethod
    def last_watermark() -> str | None:
        with connection() as conn:
            row = conn.execute(
                "SELECT watermark FROM sync_runs WHERE status IN ('success', 'partial') AND watermark IS NOT NULL "
                "ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return row["watermark"] if row else None

    # ── The run itself ──────────────────────────────────────

    def _execute(self, run: RunHandle) -> str | None:
        client = self.client_factory(self.config)
        try:
            previous = self.last_watermark()
            since = previous if run.mode == "incremental" else None
            records = list(client.articles(since=since))
            run.counts.seen = len(records)
            apps = self._resolve_applications(client, records)
            f = self.mapping.fields
            batch_numbers = {_value(r, f.number).upper() for r in records}
            first_failed: str | None = None
            for record in records:
                number = _value(record, f.number).upper()
                try:
                    self._sync_article(client, run, record, apps.get(_value(record, f.sys_id), []), batch_numbers)
                except Exception as exc:
                    run.counts.failed += 1
                    first_failed = first_failed or _value(record, f.updated_on)
                    reason = str(exc) if isinstance(exc, (ServiceNowError, ValueError)) else type(exc).__name__
                    run.notes.append(f"{number or 'unknown article'}: {reason}")
                    log.exception("ServiceNow article %s failed to sync", number or "(no number)")
            if run.mode == "full":
                # Only after the whole filter was read: anything not returned is gone from the source.
                # Articles that failed to process were still returned, so they are not retired.
                run.counts.retired += self._retire_missing(batch_numbers)
            self._rebuild_node_links()
            updated = [_value(r, f.updated_on) for r in records if _value(r, f.updated_on)]
            # A failed article is fetched again next time (the filter is >= the watermark).
            return first_failed or (max(updated) if updated else previous)
        finally:
            client.close()

    # ── Applications ────────────────────────────────────────

    def _resolve_applications(self, client, records: list[dict[str, Any]]) -> dict[str, list[App]]:
        apps_map = self.mapping.applications
        f = self.mapping.fields
        result: dict[str, list[App]] = {}
        if apps_map.mode == "article_fields" and apps_map.article_fields:
            for r in records:
                number = _value(r, apps_map.article_fields.number)
                name = _display(r, apps_map.article_fields.name)
                if number:
                    result[_value(r, f.sys_id)] = [App(number=number, name=name or number)]
            return result

        if apps_map.mode == "cmdb_ci" and apps_map.cmdb_ci:
            src = apps_map.cmdb_ci
            links = {_value(r, f.sys_id): [_part(r, src.field)] for r in records if _part(r, src.field)}
        else:
            src = apps_map.m2m
            article_ids = [s for s in (_value(r, f.sys_id) for r in records) if s]
            links = {}
            for start in range(0, len(article_ids), _CHUNK):
                chunk = [check_sys_id(s) for s in article_ids[start : start + _CHUNK]]
                rows = client.table(
                    src.table, f"{src.article_field}IN{','.join(chunk)}", f"{src.article_field},{src.ci_field}"
                )
                for row in rows:
                    links.setdefault(_plain(row.get(src.article_field)), []).append(_plain(row.get(src.ci_field)))

        ci_ids = sorted({ci for cis in links.values() for ci in cis if ci})
        fields = [src.number_field, src.name_field] + ([src.description_field] if src.description_field else [])
        cis = (
            {_plain(row.get("sys_id")): row for row in client.records_by_sys_id(src.ci_table, ci_ids, fields)}
            if ci_ids
            else {}
        )
        for article_sys_id, ci_list in links.items():
            for ci in ci_list:
                row = cis.get(ci)
                number = _plain(row.get(src.number_field)) if row else ""
                if not number:
                    continue
                name = _plain(row.get(src.name_field)) or number
                desc = _plain(row.get(src.description_field)) if src.description_field else ""
                result.setdefault(article_sys_id, []).append(App(number=number, name=name, description=desc, sys_id=ci))
        return result

    # ── One article ─────────────────────────────────────────

    def _sync_article(
        self, client, run: RunHandle, record: dict[str, Any], apps: list[App], batch_numbers: set[str]
    ) -> None:
        m, f = self.mapping, self.mapping.fields
        sys_id = check_sys_id(_value(record, f.sys_id))
        number = _value(record, f.number).upper()
        if not _KB_NUMBER.match(number):
            raise ValueError("unexpected article number format")
        apps = [a for a in apps if _APP_NUMBER.match(a.number)]
        title = _display(record, f.title).strip() or number
        body_html = _value(record, f.body_html)
        category = _display(record, f.category)
        knowledge_base = _display(record, f.knowledge_base)
        article_type = _display(record, f.article_type)
        workflow_state = _value(record, f.workflow_state)
        valid_to = _value(record, f.valid_to)
        updated_on = _value(record, f.updated_on)
        cls = m.classification
        raw_class = {
            "field": _display(record, cls.field) if cls.field else "",
            "category": category,
            "knowledge_base": knowledge_base,
        }[cls.source]
        level = cls.level_for(raw_class)
        kind = m.types.kind_for(article_type, category)
        live = workflow_state in m.published_states and not _expired(valid_to, self.today())
        content_hash = hashlib.sha256(
            json.dumps({"record": record, "apps": [a.__dict__ for a in apps]}, sort_keys=True).encode("utf-8")
        ).hexdigest()

        with connection() as conn:
            existing = conn.execute(
                "SELECT id, content_hash, active FROM kb_articles WHERE kb_number = ?", (number,)
            ).fetchone()
        if run.mode == "incremental" and existing and existing["content_hash"] == content_hash:
            run.counts.unchanged += 1
            return

        now = utc_now().isoformat()
        with connection() as conn:
            # Claim the row first (new rows stay inactive until fully processed) so documents can refer to it.
            conn.execute(
                """INSERT INTO kb_articles (external_sys_id, kb_number, title, classification, active)
                   VALUES (?, ?, ?, ?, 0)
                   ON CONFLICT(kb_number) DO UPDATE SET external_sys_id = excluded.external_sys_id""",
                (sys_id, number, title, level),
            )
            article_id = conn.execute("SELECT id FROM kb_articles WHERE kb_number = ?", (number,)).fetchone()["id"]

        images = self._sync_documents(client, run, article_id, sys_id) if live else {}

        with connection() as conn:
            known = {r["kb_number"] for r in conn.execute("SELECT kb_number FROM kb_articles WHERE active = 1")}
        ctx = LinkContext(
            instance_base=client.base_url,
            is_synced=lambda n: n in known or n in batch_numbers,
            attachment_url=lambda s: f"/api/knowledge/documents/{images[s]}/download" if s in images else None,
        )
        converted = html_to_markdown(body_html, ctx)
        summary_source = plain_text(_display(record, f.summary)) if f.summary else ""
        body = normalise_dashes(converted.markdown)
        summary = normalise_dashes(summary_source or summarise(converted.markdown))
        display_title = normalise_dashes(title)

        with connection() as conn:
            conn.execute(
                """UPDATE kb_articles SET external_sys_id = ?, title = ?, summary = ?, body_markdown = ?,
                       body_raw_html = ?, classification = ?, source_classification = ?, article_type = ?, kind = ?,
                       knowledge_base = ?, category = ?, version = ?, workflow_state = ?, valid_to = ?,
                       source_updated_at = ?, synced_at = ?, content_hash = ?, active = ?, source_url = ?
                   WHERE id = ?""",
                (
                    sys_id,
                    display_title,
                    summary,
                    body,
                    body_html,
                    level,
                    raw_class or None,
                    article_type,
                    kind,
                    knowledge_base,
                    category,
                    _display(record, f.version),
                    workflow_state,
                    valid_to,
                    updated_on,
                    now,
                    content_hash,
                    1 if live else 0,
                    f"{client.base_url}/kb_view.do?sysparm_article={number}",
                    article_id,
                ),
            )
            self._link_applications(conn, article_id, apps, now)
            self._link_articles(conn, article_id, number, converted.linked_kb_numbers, now)
            self._project_runbook(conn, article_id, number, live, kind, display_title, summary, updated_on, level)

        was_active = bool(existing and existing["active"])
        if not live:
            run.counts.retired += 1 if was_active else 0
        elif existing is None or not existing["content_hash"]:
            run.counts.created += 1
        elif existing["content_hash"] != content_hash or not was_active:
            run.counts.updated += 1
        else:
            run.counts.unchanged += 1

    def _sync_documents(self, client, run: RunHandle, article_id: int, article_sys_id: str) -> dict[str, int]:
        """Download new allowed attachments; returns attachment sys_id to document id for images."""
        if not self.mapping.documents.include_attachments:
            with connection() as conn:
                conn.execute(
                    "DELETE FROM article_documents WHERE article_id = ? AND kind = 'attachment'", (article_id,)
                )
            return {}
        allowed = list(self.mapping.documents.allowed_types)
        keep: dict[str, int] = {}
        images: dict[str, int] = {}
        for att in client.attachments(article_sys_id):
            att_id = check_sys_id(_plain(att.get("sys_id")).lower())
            name = _plain(att.get("file_name"))[:255] or "attachment"
            size_text = _plain(att.get("size_bytes"))
            size = int(size_text) if size_text.isdigit() else 0
            with connection() as conn:
                row = conn.execute(
                    "SELECT id, storage_path, content_type FROM article_documents WHERE article_id = ? AND external_sys_id = ?",
                    (article_id, att_id),
                ).fetchone()
            if row and row["storage_path"] and (self.documents_dir / row["storage_path"]).exists():
                keep[att_id] = row["id"]  # ServiceNow attachments are immutable; a change is a new sys_id
            else:
                try:
                    kind, data = self._fetch_document(
                        client, att_id, name, _plain(att.get("content_type")), size, allowed
                    )
                except DocumentRejected as exc:
                    run.counts.documents_rejected += 1
                    run.notes.append(f"{name} rejected: {exc}")
                    log.warning("Rejected attachment %s on article %s: %s", name, article_id, exc)
                    continue
                digest = store(self.documents_dir, data)
                with connection() as conn:
                    conn.execute(
                        """INSERT INTO article_documents (article_id, external_sys_id, file_name, content_type, size_bytes,
                                                          sha256, storage_path, kind, synced_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, 'attachment', ?)
                           ON CONFLICT(article_id, external_sys_id) DO UPDATE SET file_name = excluded.file_name,
                               content_type = excluded.content_type, size_bytes = excluded.size_bytes,
                               sha256 = excluded.sha256, storage_path = excluded.storage_path, synced_at = excluded.synced_at""",
                        (article_id, att_id, name, MIME[kind], len(data), digest, digest, utc_now().isoformat()),
                    )
                    row = conn.execute(
                        "SELECT id, storage_path, content_type FROM article_documents WHERE article_id = ? AND external_sys_id = ?",
                        (article_id, att_id),
                    ).fetchone()
                run.counts.documents_downloaded += 1
            keep[att_id] = row["id"]
            if row["content_type"] in (MIME["png"], MIME["jpg"]):
                images[att_id] = row["id"]
        with connection() as conn:
            stale = conn.execute(
                "SELECT id, external_sys_id FROM article_documents WHERE article_id = ? AND kind = 'attachment'",
                (article_id,),
            ).fetchall()
            for doc in stale:
                if doc["external_sys_id"] not in keep:
                    conn.execute("DELETE FROM article_documents WHERE id = ?", (doc["id"],))
        return images

    def _fetch_document(self, client, att_id: str, name: str, declared: str, size: int, allowed: list[str]):
        """Check metadata before downloading, then the real type by magic bytes; raises DocumentRejected."""
        kind = expected_type(name, declared, size, allowed, self.max_bytes)
        try:
            data = client.download(att_id, self.max_bytes)
        except DocumentTooLarge:
            raise DocumentRejected("larger than the size limit") from None
        verify_content(kind, data, self.max_bytes)
        return kind, data

    @staticmethod
    def _link_applications(conn: sqlite3.Connection, article_id: int, apps: list[App], now: str) -> None:
        conn.execute("DELETE FROM article_applications WHERE article_id = ?", (article_id,))
        for app in apps:
            conn.execute(
                """INSERT INTO applications (external_sys_id, app_number, name, description, source, active, updated_at)
                   VALUES (?, ?, ?, ?, 'servicenow', 1, ?)
                   ON CONFLICT(app_number) DO UPDATE SET external_sys_id = COALESCE(excluded.external_sys_id, external_sys_id),
                       name = excluded.name, description = excluded.description, active = 1, updated_at = excluded.updated_at""",
                (app.sys_id, app.number, normalise_dashes(app.name), normalise_dashes(app.description), now),
            )
            app_id = conn.execute("SELECT id FROM applications WHERE app_number = ?", (app.number,)).fetchone()["id"]
            conn.execute(
                "INSERT OR IGNORE INTO article_applications (article_id, application_id) VALUES (?, ?)",
                (article_id, app_id),
            )

    def _link_articles(
        self, conn: sqlite3.Connection, article_id: int, number: str, linked: list[str], now: str
    ) -> None:
        conn.execute("DELETE FROM article_documents WHERE article_id = ? AND kind = 'linked_article'", (article_id,))
        if not self.mapping.documents.include_linked_articles:
            return
        for other in linked:
            if other != number and _KB_NUMBER.match(other):
                conn.execute(
                    """INSERT INTO article_documents (article_id, file_name, kind, linked_kb_number, synced_at)
                       VALUES (?, ?, 'linked_article', ?, ?)""",
                    (article_id, other, other, now),
                )

    @staticmethod
    def _project_runbook(
        conn: sqlite3.Connection,
        article_id: int,
        number: str,
        live: bool,
        kind: str,
        title: str,
        summary: str,
        updated_on: str,
        level: str,
    ) -> None:
        """Runbook and SOP articles appear in the Runbook Library as read only rows linking to the article."""
        runbook_id = RUNBOOK_ID_OFFSET + article_id
        if not live or kind not in ("runbook", "sop"):
            conn.execute("DELETE FROM runbooks WHERE id = ? AND source = 'servicenow'", (runbook_id,))
            return
        conn.execute(
            """INSERT INTO runbooks (id, slug, title, category, version, updated, description, preconditions, steps,
                                     escalation_triggers, source, kb_article_id, classification)
               VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', 'servicenow', ?, ?)
               ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, category = excluded.category,
                   version = excluded.version, updated = excluded.updated, description = excluded.description,
                   kb_article_id = excluded.kb_article_id, classification = excluded.classification""",
            (
                runbook_id,
                f"servicenow-{number.lower()}",
                title,
                "Runbook" if kind == "runbook" else "SOP",
                number,
                updated_on[:10],
                summary,
                article_id,
                level,
            ),
        )

    # ── Whole run housekeeping ──────────────────────────────

    @staticmethod
    def _retire_missing(seen: set[str]) -> int:
        with connection() as conn:
            rows = conn.execute("SELECT id, kb_number FROM kb_articles WHERE active = 1").fetchall()
            gone = [r["id"] for r in rows if r["kb_number"] not in seen]
            for article_id in gone:
                conn.execute(
                    "UPDATE kb_articles SET active = 0, synced_at = ? WHERE id = ?", (utc_now().isoformat(), article_id)
                )
                conn.execute(
                    "DELETE FROM runbooks WHERE id = ? AND source = 'servicenow'", (RUNBOOK_ID_OFFSET + article_id,)
                )
        return len(gone)

    def _rebuild_node_links(self) -> None:
        """Links from mapping.node_links (by application number and by keyword); manual links are kept."""
        links = self.mapping.node_links
        keywords = [
            (re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE), ids) for word, ids in links.by_keyword.items()
        ]
        with connection() as conn:
            node_ids = {r["id"] for r in conn.execute("SELECT id FROM nodes")}
            conn.execute("DELETE FROM article_nodes WHERE origin = 'mapping'")
            articles = conn.execute("SELECT id, title, category FROM kb_articles WHERE active = 1").fetchall()
            app_rows = conn.execute(
                "SELECT aa.article_id, a.app_number FROM article_applications aa JOIN applications a ON a.id = aa.application_id"
            ).fetchall()
            apps: dict[int, list[str]] = {}
            for row in app_rows:
                apps.setdefault(row["article_id"], []).append(row["app_number"])
            for article in articles:
                text = f"{article['title']} {article['category'] or ''}"
                targets = {n for number in apps.get(article["id"], []) for n in links.by_application.get(number, [])}
                targets |= {n for pattern, ids in keywords if pattern.search(text) for n in ids}
                for node_id in sorted(targets & node_ids):
                    conn.execute(
                        "INSERT OR IGNORE INTO article_nodes (article_id, node_id, origin) VALUES (?, ?, 'mapping')",
                        (article["id"], node_id),
                    )
