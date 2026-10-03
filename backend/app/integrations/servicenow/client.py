"""Read only ServiceNow REST client (Table API and Attachment API).

Resilience: connect and read timeouts, retries with exponential backoff and jitter on 429, 5xx and
transport errors (honouring Retry-After), and a circuit breaker so an outage fails fast instead of
tying up the app. Safety: TLS verification always on, no redirects, every request pinned to the
validated instance host, and errors that never carry credentials, bodies or query strings.
"""

import base64
import logging
import random
import re
import time
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from ...config import IS_DEV
from .errors import CircuitOpenError, DocumentTooLarge, ServiceNowConfigError, ServiceNowError
from .mapping import Mapping
from .settings import ServiceNowSettings
from .urls import check_sys_id, ensure_same_origin, validate_instance_url

log = logging.getLogger("fingen.servicenow")

PAGE_SIZE = 100
MAX_ATTEMPTS = 4
BACKOFF_BASE = 0.5
BACKOFF_CAP = 30.0
RETRY_AFTER_CAP = 60.0
RETRY_STATUS = {429, 500, 502, 503, 504}
TOKEN_SKEW = 60.0
_WATERMARK = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
_TABLE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class CircuitBreaker:
    """Opens after `threshold` consecutive failed calls; lets one trial call through after `reset_after`."""

    def __init__(self, threshold: int = 5, reset_after: float = 300.0, clock: Callable[[], float] = time.monotonic):
        self.threshold = threshold
        self.reset_after = reset_after
        self.clock = clock
        self.failures = 0
        self.opened_at: float | None = None

    @property
    def state(self) -> str:
        if self.opened_at is None:
            return "closed"
        return "half_open" if self.clock() - self.opened_at >= self.reset_after else "open"

    def before_call(self) -> None:
        if self.state == "open":
            raise CircuitOpenError("ServiceNow is unavailable; retrying later")

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.threshold:
            self.opened_at = self.clock()


def retry_after_seconds(value: str | None, now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> float | None:
    """Parse Retry-After (delta seconds or an HTTP date), capped; None when absent or unparseable."""
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return min(float(value), RETRY_AFTER_CAP)
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return max(0.0, min((when - now()).total_seconds(), RETRY_AFTER_CAP))


class ServiceNowClient:
    def __init__(
        self,
        settings: ServiceNowSettings,
        mapping: Mapping,
        *,
        breaker: CircuitBreaker | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        jitter: Callable[[], float] = random.random,  # nosec B311 (backoff jitter, not security)
    ) -> None:
        self.settings = settings
        self.mapping = mapping
        self.base_url = validate_instance_url(settings.instance_url, settings.allowed_hosts)
        if settings.auth_mode == "basic" and not IS_DEV:
            raise ServiceNowConfigError("Basic auth is only allowed for developer instances (APP_ENV=development)")
        if settings.auth_mode == "oauth" and not (settings.client_id and settings.client_secret.get_secret_value()):
            raise ServiceNowConfigError("OAuth needs SERVICENOW_CLIENT_ID and SERVICENOW_CLIENT_SECRET")
        if settings.auth_mode == "basic" and not (settings.username and settings.password.get_secret_value()):
            raise ServiceNowConfigError("Basic auth needs SERVICENOW_USERNAME and SERVICENOW_PASSWORD")
        self.breaker = breaker or CircuitBreaker(clock=clock)
        self._sleep = sleep
        self._clock = clock
        self._jitter = jitter
        self._token: str | None = None
        self._token_expires = 0.0
        self._refresh_token: str | None = None
        self._http = httpx.Client(
            base_url=self.base_url,
            timeout=httpx.Timeout(30.0, connect=5.0),
            follow_redirects=False,
            verify=True,
            headers={"Accept": "application/json", "User-Agent": "FinGen-Training-Hub/1.0 (read only)"},
        )

    def close(self) -> None:
        self._http.close()

    # ── Auth ────────────────────────────────────────────────

    def _auth_header(self) -> dict[str, str]:
        if self.settings.auth_mode == "basic":
            pair = f"{self.settings.username}:{self.settings.password.get_secret_value()}".encode()
            return {"Authorization": f"Basic {base64.b64encode(pair).decode('ascii')}"}
        if not self._token or self._clock() >= self._token_expires:
            self._fetch_token()
        return {"Authorization": f"Bearer {self._token}"}

    def _fetch_token(self) -> None:
        s = self.settings
        form = {"client_id": s.client_id, "client_secret": s.client_secret.get_secret_value()}
        if self._refresh_token:
            form |= {"grant_type": "refresh_token", "refresh_token": self._refresh_token}
        elif s.username:
            form |= {"grant_type": "password", "username": s.username, "password": s.password.get_secret_value()}
        else:
            form |= {"grant_type": "client_credentials"}
        try:
            resp = self._send("POST", "/oauth_token.do", data=form, auth=False)
        except ServiceNowError as exc:
            if self._refresh_token and exc.status in (400, 401):
                # The refresh token expired or was revoked: start over with the primary grant.
                self._refresh_token = None
                return self._fetch_token()
            raise ServiceNowError("ServiceNow OAuth token request failed", exc.status) from None
        try:
            payload = resp.json()
            self._token = str(payload["access_token"])
        except (ValueError, KeyError, TypeError):
            raise ServiceNowError("ServiceNow OAuth token response was not understood") from None
        self._refresh_token = payload.get("refresh_token") or None
        self._token_expires = self._clock() + max(0.0, float(payload.get("expires_in", 1800)) - TOKEN_SKEW)

    def _invalidate_token(self) -> None:
        self._token = None
        self._token_expires = 0.0

    # ── Transport with retries ──────────────────────────────

    def _backoff(self, attempt: int) -> float:
        return min(BACKOFF_CAP, BACKOFF_BASE * 2**attempt) + self._jitter() * BACKOFF_BASE

    def _send(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        auth: bool = True,
        stream: bool = False,
    ) -> httpx.Response:
        self.breaker.before_call()
        reauthed = False
        attempt = 0
        while True:
            headers = self._auth_header() if auth else {}
            request = self._http.build_request(method, path, params=params, data=data, headers=headers)
            ensure_same_origin(request.url, self.base_url)
            delay: float | None = None
            try:
                resp = self._http.send(request, stream=stream)
            except httpx.TransportError as exc:
                error = ServiceNowError(f"ServiceNow unreachable ({type(exc).__name__})")
                delay = self._backoff(attempt)
            else:
                status = resp.status_code
                if resp.is_redirect:
                    resp.close()
                    raise ServiceNowError("ServiceNow answered with a redirect; refusing to follow it", status)
                if status == 401 and auth and not reauthed and self.settings.auth_mode == "oauth":
                    resp.close()
                    self._invalidate_token()
                    reauthed = True
                    continue
                if status in RETRY_STATUS:
                    resp.close()
                    error = ServiceNowError(f"ServiceNow returned HTTP {status}", status)
                    delay = retry_after_seconds(resp.headers.get("Retry-After"))
                    if delay is None:
                        delay = self._backoff(attempt)
                elif status >= 400:
                    resp.close()
                    # A client error (bad ACL, bad field) is a configuration problem, not an outage.
                    raise ServiceNowError(f"ServiceNow returned HTTP {status}", status)
                else:
                    self.breaker.record_success()
                    return resp
            attempt += 1
            if attempt >= MAX_ATTEMPTS:
                self.breaker.record_failure()
                log.warning("ServiceNow call failed after %d attempts: %s", attempt, error)
                raise error
            self._sleep(delay)

    # ── Table API ───────────────────────────────────────────

    def table(
        self,
        table: str,
        query: str,
        fields: str,
        display_value: str = "false",
        *,
        limit: int | None = None,
        page_size: int = PAGE_SIZE,
    ) -> Iterator[dict[str, Any]]:
        """Yield records page by page (sysparm_offset pagination) until a short page or `limit`."""
        if not _TABLE.match(table):
            raise ValueError("invalid table name")
        offset = 0
        seen = 0
        while True:
            size = min(page_size, limit - seen) if limit else page_size
            resp = self._send(
                "GET",
                f"/api/now/table/{table}",
                params={
                    "sysparm_query": query,
                    "sysparm_fields": fields,
                    "sysparm_display_value": display_value,
                    "sysparm_exclude_reference_link": "true",
                    "sysparm_no_count": "true",
                    "sysparm_limit": size,
                    "sysparm_offset": offset,
                },
            )
            rows = _result(resp)
            yield from rows
            seen += len(rows)
            if len(rows) < size or (limit and seen >= limit):
                return
            offset += size

    def articles(self, since: str | None = None, *, limit: int | None = None) -> Iterator[dict[str, Any]]:
        """Articles matching the mapping's filter, oldest change first; `since` is a UTC watermark."""
        m = self.mapping
        updated = m.fields.updated_on.name
        query = m.encoded_query
        if since:
            if not _WATERMARK.match(since):
                raise ValueError("watermark must look like YYYY-MM-DD HH:MM:SS")
            # >= with content hashes: an article updated in the same second as the watermark is not lost.
            query += f"^{updated}>={since}"
        query += f"^ORDERBY{updated}"
        return self.table(m.source_table, query, m.sysparm_fields(), m.sysparm_display_value(), limit=limit)

    def records_by_sys_id(self, table: str, sys_ids: list[str], fields: list[str]) -> list[dict[str, Any]]:
        """Fetch referenced records (business applications, CIs) in chunks of 50."""
        ids = [check_sys_id(s) for s in dict.fromkeys(sys_ids)]
        rows: list[dict[str, Any]] = []
        for start in range(0, len(ids), 50):
            chunk = ids[start : start + 50]
            rows += self.table(table, f"sys_idIN{','.join(chunk)}", ",".join(["sys_id", *fields]))
        return rows

    # ── Attachment API ──────────────────────────────────────

    def attachments(self, article_sys_id: str) -> list[dict[str, Any]]:
        check_sys_id(article_sys_id)
        resp = self._send(
            "GET",
            "/api/now/attachment",
            params={
                "sysparm_query": f"table_name={self.mapping.source_table}^table_sys_id={article_sys_id}",
                "sysparm_limit": PAGE_SIZE,
            },
        )
        return _result(resp)

    def download(self, attachment_sys_id: str, max_bytes: int) -> bytes:
        """Stream one attachment, aborting as soon as it exceeds max_bytes."""
        check_sys_id(attachment_sys_id)
        resp = self._send("GET", f"/api/now/attachment/{attachment_sys_id}/file", stream=True)
        try:
            declared = resp.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > max_bytes:
                raise DocumentTooLarge("Attachment exceeds the size limit")
            chunks: list[bytes] = []
            total = 0
            for chunk in resp.iter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise DocumentTooLarge("Attachment exceeds the size limit")
                chunks.append(chunk)
            return b"".join(chunks)
        except httpx.TransportError as exc:
            raise ServiceNowError(f"ServiceNow download interrupted ({type(exc).__name__})") from None
        finally:
            resp.close()


def _result(resp: httpx.Response) -> list[dict[str, Any]]:
    try:
        result = resp.json()["result"]
    except (ValueError, KeyError, TypeError):
        raise ServiceNowError("ServiceNow response was not understood", resp.status_code) from None
    if not isinstance(result, list):
        raise ServiceNowError("ServiceNow response was not understood", resp.status_code)
    return result
