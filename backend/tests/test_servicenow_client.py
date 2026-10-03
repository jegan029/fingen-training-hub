"""ServiceNow client: SSRF guard, auth, pagination, retries, circuit breaker, downloads, redaction, mock."""

import logging
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
import respx
from pydantic import SecretStr

from app.integrations.servicenow import client as client_module
from app.integrations.servicenow.client import CircuitBreaker, ServiceNowClient, retry_after_seconds
from app.integrations.servicenow.errors import (
    CircuitOpenError,
    DocumentTooLarge,
    ServiceNowConfigError,
    ServiceNowError,
)
from app.integrations.servicenow.mapping import load_mapping
from app.integrations.servicenow.mock import MockServiceNowClient
from app.integrations.servicenow.redaction import RedactionFilter, install_redaction, redact
from app.integrations.servicenow.settings import DEFAULT_MAPPING_PATH, ServiceNowSettings
from app.integrations.servicenow.urls import validate_instance_url

BASE = "https://example.service-now.com"
SECRET = "client-secret-value-123"  # gitleaks:allow (test-only value)
TOKEN = "tok-abcdef123456"  # gitleaks:allow (test-only value)
ALLOWED = ("*.service-now.com",)
ART = "a" + "0" * 30 + "1"
ATT = "e" + "0" * 30 + "1"


@pytest.fixture(scope="module")
def mapping():
    return load_mapping(DEFAULT_MAPPING_PATH)


def make_settings(**overrides) -> ServiceNowSettings:
    values = {
        "enabled": True,
        "mock_mode": False,
        "instance_url": BASE,
        "client_id": "fingen-test",
        "client_secret": SecretStr(SECRET),
    }
    return ServiceNowSettings(**(values | overrides))


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture()
def sleeps():
    return []


@pytest.fixture()
def clock():
    return FakeClock()


@pytest.fixture()
def make_client(mapping, sleeps, clock):
    def build(**overrides) -> ServiceNowClient:
        return ServiceNowClient(
            make_settings(**overrides), mapping, sleep=sleeps.append, clock=clock, jitter=lambda: 0.0
        )

    return build


@pytest.fixture()
def sn():
    with respx.mock(base_url=BASE, assert_all_called=False) as router:
        router.post("/oauth_token.do").respond(json={"access_token": TOKEN, "expires_in": 1800})
        yield router


def rows(n: int, start: int = 0) -> dict:
    return {"result": [{"sys_id": f"{i:032x}"} for i in range(start, start + n)]}


# ── SSRF guard ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "http://example.service-now.com",
        "https://example.service-now.com.attacker.example",
        "https://evilservice-now.com",
        "https://user:pw@example.service-now.com",
        "https://example.service-now.com:8443",
        "https://example.service-now.com/api",
        "https://example.service-now.com?x=1",
        "https://10.0.0.5",
        "https://[::1]",
        "https://localhost",
        "file:///etc/passwd",
        "",
    ],
)
def test_instance_url_rejected(url):
    with pytest.raises(ServiceNowConfigError):
        validate_instance_url(url, ALLOWED)


def test_instance_url_normalised_and_allowlist_overridable():
    assert validate_instance_url("https://Example.Service-Now.com/", ALLOWED) == BASE
    assert (
        validate_instance_url("https://kb.internal.example", ("kb.internal.example",)) == "https://kb.internal.example"
    )
    with pytest.raises(ServiceNowConfigError):
        validate_instance_url(BASE, ("kb.internal.example",))


def test_client_validates_url_and_credentials(make_client, monkeypatch):
    with pytest.raises(ServiceNowConfigError):
        make_client(instance_url="http://example.service-now.com")
    with pytest.raises(ServiceNowConfigError, match="OAuth needs"):
        make_client(client_secret=SecretStr(""))
    monkeypatch.setattr(client_module, "IS_DEV", False)
    with pytest.raises(ServiceNowConfigError, match="Basic auth is only allowed"):
        make_client(auth_mode="basic", username="svc", password=SecretStr("pw-value"))


def test_redirect_is_never_followed(make_client, sn):
    sn.get("/api/now/attachment").respond(302, headers={"Location": "https://attacker.example/steal"})
    with pytest.raises(ServiceNowError, match="redirect") as exc:
        make_client().attachments(ART)
    assert exc.value.status == 302
    assert not any(call.request.url.host == "attacker.example" for call in sn.calls)


# ── Table API ───────────────────────────────────────────────


def test_table_paginates_with_mapped_params(make_client, sn, mapping):
    route = sn.get("/api/now/table/kb_knowledge").mock(
        side_effect=[httpx.Response(200, json=rows(100)), httpx.Response(200, json=rows(1, 100))]
    )
    result = list(make_client().articles(since="2026-09-01 08:00:00"))
    assert len(result) == 101
    first, second = (call.request.url.params for call in route.calls)
    assert first["sysparm_offset"] == "0" and second["sysparm_offset"] == "100"
    assert first["sysparm_limit"] == "100"
    assert first["sysparm_fields"] == mapping.sysparm_fields()
    assert first["sysparm_display_value"] == "all"
    assert first["sysparm_exclude_reference_link"] == "true"
    query = first["sysparm_query"]
    assert query.startswith(mapping.encoded_query)
    assert query.endswith("^sys_updated_on>=2026-09-01 08:00:00^ORDERBYsys_updated_on")
    assert route.calls[0].request.headers["Authorization"] == f"Bearer {TOKEN}"


def test_limit_stops_early(make_client, sn):
    route = sn.get("/api/now/table/kb_knowledge").respond(json=rows(3))
    assert len(list(make_client().articles(limit=3))) == 3
    assert route.call_count == 1 and route.calls[0].request.url.params["sysparm_limit"] == "3"


@pytest.mark.parametrize("bad", ["2026-09-01", "2026-09-01 08:00:00^ORDERBYnumber", "x"])
def test_watermark_cannot_inject_query(make_client, bad):
    with pytest.raises(ValueError):
        list(make_client().articles(since=bad))


def test_records_by_sys_id_rejects_bad_ids(make_client):
    with pytest.raises(ValueError):
        make_client().records_by_sys_id("cmdb_ci_business_app", ["abc^ORnumber=1"], ["number"])


# ── Retries and the circuit breaker ─────────────────────────


def test_429_honours_retry_after(make_client, sn, sleeps):
    route = sn.get("/api/now/attachment").mock(
        side_effect=[httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200, json=rows(1))]
    )
    assert len(make_client().attachments(ART)) == 1
    assert route.call_count == 2 and sleeps == [7.0]


def test_retry_after_parsing():
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=UTC)
    assert retry_after_seconds("12") == 12.0
    assert retry_after_seconds("3600") == 60.0  # capped
    assert retry_after_seconds("Fri, 02 Oct 2026 12:00:30 GMT", now=lambda: now) == 30.0
    assert retry_after_seconds("Fri, 02 Oct 2026 11:00:00 GMT", now=lambda: now) == 0.0
    assert retry_after_seconds("soon") is None and retry_after_seconds(None) is None


def test_5xx_retries_with_exponential_backoff_then_succeeds(make_client, sn, sleeps):
    sn.get("/api/now/attachment").mock(
        side_effect=[httpx.Response(503), httpx.Response(502), httpx.Response(200, json=rows(1))]
    )
    assert len(make_client().attachments(ART)) == 1
    assert sleeps == [0.5, 1.0]


def test_gives_up_after_max_attempts(make_client, sn, sleeps):
    route = sn.get("/api/now/attachment").respond(500, text=f"stack trace with {SECRET}")
    with pytest.raises(ServiceNowError) as exc:
        make_client().attachments(ART)
    assert route.call_count == client_module.MAX_ATTEMPTS and len(sleeps) == client_module.MAX_ATTEMPTS - 1
    # The error never echoes the response body, the query string or credentials.
    assert str(exc.value) == "ServiceNow returned HTTP 500"


def test_transport_errors_are_retried(make_client, sn, sleeps):
    sn.get("/api/now/attachment").mock(side_effect=[httpx.ConnectTimeout("boom"), httpx.Response(200, json=rows(1))])
    assert len(make_client().attachments(ART)) == 1 and sleeps == [0.5]


def test_client_errors_are_not_retried(make_client, sn, sleeps):
    route = sn.get("/api/now/attachment").respond(403)
    client = make_client()
    with pytest.raises(ServiceNowError, match="HTTP 403"):
        client.attachments(ART)
    assert route.call_count == 1 and sleeps == [] and client.breaker.failures == 0


def test_circuit_breaker_opens_and_half_opens(make_client, sn, clock):
    route = sn.get("/api/now/attachment").respond(503)
    client = make_client()
    for _ in range(client.breaker.threshold):
        with pytest.raises(ServiceNowError):
            client.attachments(ART)
    calls = route.call_count
    with pytest.raises(CircuitOpenError):
        client.attachments(ART)
    assert route.call_count == calls  # failed fast, no request sent
    clock.now += client.breaker.reset_after
    assert client.breaker.state == "half_open"
    route.respond(json=rows(1))
    assert len(client.attachments(ART)) == 1
    assert client.breaker.state == "closed"


def test_breaker_counts_consecutive_failures_only():
    breaker = CircuitBreaker(threshold=2, clock=FakeClock())
    breaker.record_failure()
    breaker.record_success()
    breaker.record_failure()
    assert breaker.state == "closed"


# ── OAuth ───────────────────────────────────────────────────


def test_token_is_cached_and_refreshed(make_client, sn, clock):
    first = {"access_token": "tok-one-123456", "expires_in": 600, "refresh_token": "ref-1"}  # gitleaks:allow
    token_route = sn.post("/oauth_token.do").mock(
        side_effect=[
            httpx.Response(200, json=first),
            httpx.Response(200, json={"access_token": "tok-two-123456", "expires_in": 600}),
        ]
    )
    api = sn.get("/api/now/attachment").respond(json=rows(0))
    client = make_client()
    client.attachments(ART)
    client.attachments(ART)
    assert token_route.call_count == 1
    form = token_route.calls[0].request.content.decode()
    assert "grant_type=client_credentials" in form
    clock.now += 600  # past expiry minus the skew
    client.attachments(ART)
    assert token_route.call_count == 2
    assert "grant_type=refresh_token" in token_route.calls[1].request.content.decode()
    assert api.calls[-1].request.headers["Authorization"] == "Bearer tok-two-123456"


def test_password_grant_when_username_set(make_client, sn):
    token_route = sn.post("/oauth_token.do").respond(json={"access_token": TOKEN, "expires_in": 1800})
    sn.get("/api/now/attachment").respond(json=rows(0))
    make_client(username="svc.fingen", password=SecretStr("pw-value-123")).attachments(ART)
    assert "grant_type=password" in token_route.calls[0].request.content.decode()


def test_401_fetches_a_new_token_once(make_client, sn):
    token_route = sn.post("/oauth_token.do").mock(
        side_effect=[
            httpx.Response(200, json={"access_token": "tok-old-123456", "expires_in": 1800}),
            httpx.Response(200, json={"access_token": "tok-new-123456", "expires_in": 1800}),
        ]
    )
    api = sn.get("/api/now/attachment").mock(side_effect=[httpx.Response(401), httpx.Response(200, json=rows(1))])
    assert len(make_client().attachments(ART)) == 1
    assert token_route.call_count == 2
    assert api.calls[-1].request.headers["Authorization"] == "Bearer tok-new-123456"


def test_token_failure_message_has_no_secret(make_client, sn):
    sn.post("/oauth_token.do").respond(401, json={"error": "access_denied", "client_secret": SECRET})
    with pytest.raises(ServiceNowError) as exc:
        make_client().attachments(ART)
    assert SECRET not in str(exc.value) and "token request failed" in str(exc.value)


def test_basic_auth_in_development(make_client, sn):
    route = sn.get("/api/now/attachment").respond(json=rows(0))
    make_client(auth_mode="basic", username="svc", password=SecretStr("pw-value")).attachments(ART)
    assert route.calls[0].request.headers["Authorization"].startswith("Basic ")


# ── Downloads ───────────────────────────────────────────────


def test_download_streams_and_enforces_size(make_client, sn):
    route = sn.get(f"/api/now/attachment/{ATT}/file")
    route.respond(content=b"%PDF-1.4 small")
    client = make_client()
    assert client.download(ATT, max_bytes=100) == b"%PDF-1.4 small"
    route.respond(content=b"x" * 101)
    with pytest.raises(DocumentTooLarge):
        client.download(ATT, max_bytes=100)
    # A lying or missing Content-Length is caught while streaming.
    route.respond(stream=httpx.ByteStream(b"y" * 150), headers={"Content-Length": "10"})
    with pytest.raises(DocumentTooLarge):
        client.download(ATT, max_bytes=100)


def test_download_rejects_bad_sys_id(make_client):
    with pytest.raises(ValueError):
        make_client().download("../../etc/passwd", max_bytes=10)


# ── Redaction ───────────────────────────────────────────────


def test_redact_patterns():
    text = (
        f"Authorization: Bearer {TOKEN} body grant_type=password&password=hunter2xyz&client_secret={SECRET} "
        '{"access_token": "abc.def.ghi", "refresh_token":"r-123456"} Basic c3ZjOnB3LXZhbHVl'
    )
    out = redact(text, [SECRET])
    for leaked in (TOKEN, "hunter2xyz", SECRET, "abc.def.ghi", "r-123456", "c3ZjOnB3LXZhbHVl"):
        assert leaked not in out
    assert "grant_type=password" in out  # non secret context is kept


def test_redaction_filter_on_log_records_and_tracebacks(caplog):
    logger = logging.getLogger("fingen.servicenow.test")
    flt = RedactionFilter([SECRET])
    logger.addFilter(flt)
    try:
        with caplog.at_level(logging.INFO, logger="fingen.servicenow.test"):
            logger.info("token %s secret %s", TOKEN, SECRET)
            try:
                raise RuntimeError(f"failed with client_secret={SECRET}")
            except RuntimeError:
                logger.exception("call failed")
    finally:
        logger.removeFilter(flt)
    text = caplog.text + "".join(r.exc_text or "" for r in caplog.records)
    assert SECRET not in text and "client_secret=[REDACTED]" in text


def test_redaction_keeps_args_for_uvicorn_access_log():
    """Regression: uvicorn's access formatter unpacks record.args, so they must stay a tuple."""
    from uvicorn.logging import AccessFormatter

    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", f"/api/health?token={SECRET}", "1.1", 200),
        None,
    )
    RedactionFilter([SECRET]).filter(record)
    line = AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False).format(record)
    assert line == '127.0.0.1:5000 - "GET /api/health?token=[REDACTED] HTTP/1.1" 200 OK'


def test_install_redaction_covers_handlers_and_is_idempotent():
    root = logging.getLogger()
    handler = logging.StreamHandler()
    root.addHandler(handler)
    try:
        install_redaction([SECRET])
        install_redaction([SECRET])
        assert sum(isinstance(f, RedactionFilter) for f in handler.filters) == 1
        assert sum(isinstance(f, RedactionFilter) for f in logging.getLogger("httpx").filters) == 1
    finally:
        root.removeHandler(handler)


def test_secrets_never_in_logs_from_client(make_client, sn, caplog):
    sn.post("/oauth_token.do").respond(json={"access_token": TOKEN, "expires_in": 1800})
    sn.get("/api/now/attachment").respond(503)
    install_redaction([SECRET])
    with caplog.at_level(logging.DEBUG), pytest.raises(ServiceNowError):
        make_client().attachments(ART)
    assert SECRET not in caplog.text and TOKEN not in caplog.text


# ── Mock mode and the probe ─────────────────────────────────


def test_mock_applies_filter_watermark_and_shape(mapping):
    mock = MockServiceNowClient(mapping)
    numbers = [r["number"]["value"] for r in mock.articles()]
    # Published, latest, in the selected knowledge bases; ordered by update time.
    assert "KB0010013" not in numbers  # retired
    assert "KB0010015" not in numbers  # other knowledge base
    assert numbers == sorted(numbers) and len(numbers) == 13
    first = next(mock.articles())
    assert set(first) == set(mapping.sysparm_fields().split(","))
    assert first["cmdb_ci"] == {"value": "c" + "0" * 30 + "1", "display_value": "Ledger Gateway"}
    newer = [r["number"]["value"] for r in mock.articles(since="2026-09-12 00:00:00")]
    assert newer == ["KB0010012", "KB0010014"]
    mock.bump("KB0010001", short_description="Updated title")
    assert [r["number"]["value"] for r in mock.articles(since="2026-09-15 00:00:00")] == ["KB0010001"]


def test_mock_fixtures_cover_the_brief(mapping):
    mock = MockServiceNowClient(mapping)
    records = mock.records
    levels = {mapping.classification.level_for(r["u_classification"]) for r in records}
    assert levels == {"public", "internal", "confidential", "restricted"}
    assert {r["cmdb_ci"]["display_value"] for r in records} >= {
        "Ledger Gateway",
        "Card Switch",
        "Batch Scheduler",
        "Client Portal",
    }
    types = {a["content_type"] for a in mock._attachments}
    assert {"application/pdf", "image/png", "text/plain"} <= types
    assert any("wordprocessingml" in t for t in types)
    apps = mock.records_by_sys_id("cmdb_ci_business_app", ["c" + "0" * 30 + "2"], ["number", "name"])
    assert apps == [{"sys_id": "c" + "0" * 30 + "2", "number": "APM0001002", "name": "Card Switch"}]
    attachments = mock.attachments("a" + "0" * 30 + "1")
    assert [a["file_name"] for a in attachments] == ["posting-flow.pdf"]
    assert mock.download(attachments[0]["sys_id"], 10_000).startswith(b"%PDF")
    with pytest.raises(DocumentTooLarge):
        mock.download(attachments[0]["sys_id"], 10)


def test_probe_in_mock_mode_prints_no_content():
    script = Path(__file__).resolve().parents[2] / "scripts" / "servicenow_probe.py"
    result = subprocess.run(
        [sys.executable, str(script), "--limit", "3"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**_env(), "SERVICENOW_ENABLED": "true", "SERVICENOW_MOCK_MODE": "true"},
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "All required fields found." in result.stdout
    # Titles and bodies never appear; only numbers, field states and hashes.
    assert "Ledger Gateway posting failure" not in result.stdout
    assert "PENDING_GL" not in result.stdout


def _env() -> dict:
    import os

    return dict(os.environ)
