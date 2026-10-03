"""ServiceNow sync: migration, content processing, dash rule, incremental and full sync, documents, locking."""

import copy
import io
import json
import re
import sqlite3
import threading
import zipfile
from datetime import date, timedelta

import pytest
import yaml

from app import db
from app.db import connection, utc_now
from app.integrations.servicenow.config import load_config
from app.integrations.servicenow.documents import (
    DocumentRejected,
    expected_type,
    sniff,
    stored_path,
)
from app.integrations.servicenow.errors import ServiceNowError
from app.integrations.servicenow.mapping import parse_mapping
from app.integrations.servicenow.mock import FIXTURES, MockServiceNowClient
from app.integrations.servicenow.processing import LinkContext, html_to_markdown
from app.integrations.servicenow.scheduler import _job, next_run_times, start_scheduler
from app.integrations.servicenow.sync import SyncEngine, SyncInProgress
from app.services.prose import find, normalise_dashes, prose

ARTICLES = json.loads((FIXTURES / "articles.json").read_text(encoding="utf-8"))
CTX = LinkContext("https://example.service-now.com", lambda n: n == "KB0010001")


@pytest.fixture()
def config():
    return load_config()


@pytest.fixture()
def mock(config):
    return MockServiceNowClient(config.mapping)


@pytest.fixture()
def engine(client, config, mock, tmp_path):
    """A fresh database (the client fixture runs the lifespan) and an engine over a shared mock."""
    return SyncEngine(config, client_factory=lambda _cfg: mock, documents_dir=tmp_path / "docs")


def article(number):
    with connection() as conn:
        return conn.execute("SELECT * FROM kb_articles WHERE kb_number = ?", (number,)).fetchone()


def run_row(run_id):
    with connection() as conn:
        return conn.execute("SELECT * FROM sync_runs WHERE id = ?", (run_id,)).fetchone()


# ── Migration ───────────────────────────────────────────────


def test_migration_keeps_existing_rows(tmp_path):
    conn = sqlite3.connect(tmp_path / "old.db")
    conn.row_factory = sqlite3.Row
    conn.executescript(db.SCHEMA_SQL)
    for migration in db.MIGRATIONS[:5]:
        migration(conn)
    conn.execute("PRAGMA user_version = 5")
    conn.execute(
        "INSERT INTO users (id, name, email, role) VALUES (1, 'A', 'a@x.demo', 'admin'), (2, 'L', 'l@x.demo', 'learner')"
    )
    conn.execute(
        "INSERT INTO runbooks (id, slug, title, category, version, updated, description, preconditions, steps, "
        "escalation_triggers) VALUES (7, 'rb', 'Old runbook', 'Transactions', 'v1', '2026-01-01', 'd', '[]', '[]', '[]')"
    )
    conn.commit()
    db._run_migrations(conn)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == len(db.MIGRATIONS)
    rb = conn.execute("SELECT title, source, classification, kb_article_id FROM runbooks WHERE id = 7").fetchone()
    assert tuple(rb) == ("Old runbook", "local", "internal", None)
    clearance = dict(conn.execute("SELECT role, max_classification FROM users").fetchall())
    assert clearance == {"admin": "restricted", "learner": "internal"}
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE users SET max_classification = 'secret' WHERE id = 2")
    conn.close()


def test_dataset_runbook_ids_must_stay_below_servicenow_range(tmp_path, monkeypatch):
    dataset = tmp_path / "dataset.json"
    rb = {"id": db.RUNBOOK_ID_OFFSET, "slug": "x", "title": "x", "category": "x", "version": "1", "updated": "x"}
    dataset.write_text(json.dumps({"runbooks": [rb]}), encoding="utf-8")
    monkeypatch.setattr(db, "DATASET_PATH", dataset)
    conn = sqlite3.connect(":memory:")
    with pytest.raises(ValueError, match="below"):
        db._sync_dataset(conn)


# ── Content processing ──────────────────────────────────────


def test_hostile_html_is_neutralised():
    hostile = ARTICLES[8]["text"]  # KB0010009
    md = html_to_markdown(
        hostile
        + '<p onmouseover="x()">Hi <a href="vbscript:msgbox(1)">v</a> <a href="//evil.example/x">p</a></p>'
        + "<p>[click](javascript:alert(1)) and ![x](data:image/png;base64,AAAA)</p>"
        + '<object data="x.swf"></object><style>body{display:none}</style>',
        CTX,
    ).markdown
    lowered = md.lower()
    for bad in ("<script", "document.cookie", "onclick", "onmouseover", "javascript:", "vbscript:", "data:image",
                "iframe", "attacker.example", "tracker.example", "evil.example", "<object", "display:none"):  # fmt: skip
        assert bad not in lowered, bad
    assert "Client operators cannot sign in to the portal." in md
    assert "Reset the session" in md  # link text kept, dangerous link dropped


def test_links_and_images_are_rewritten():
    ctx = LinkContext(
        "https://example.service-now.com",
        is_synced=lambda n: n == "KB0010001",
        attachment_url=lambda s: "/api/knowledge/documents/9/download" if s == "e" + "0" * 30 + "3" else None,
    )
    html = (
        '<a href="https://example.service-now.com/kb_view.do?sysparm_article=KB0010001">synced</a> '
        '<a href="/kb_view.do?sysparm_article=kb0010099">unsynced</a> '
        '<a href="https://status.example.com/x">external</a> <a href="#top">anchor</a> '
        '<img src="/sys_attachment.do?sys_id=' + "e" + "0" * 30 + '3"> <img src="https://cdn.example/x.png">'
    )
    converted = html_to_markdown(html, ctx)
    md = converted.markdown
    assert "[synced](/knowledge/kb/KB0010001)" in md
    assert "[unsynced](https://example.service-now.com/kb_view.do?sysparm_article=KB0010099)" in md
    assert "[external](https://status.example.com/x)" in md
    assert "anchor" in md and "#top" not in md
    assert "![](/api/knowledge/documents/9/download)" in md and "cdn.example" not in md
    assert converted.linked_kb_numbers == ["KB0010001", "KB0010099"]


@pytest.mark.parametrize(
    "text,expected",
    [
        ("5–10 minutes", "5 to 10 minutes"),
        ("Severity P1–P4", "Severity P1 to P4"),
        ("Postings stall — the alert fires.", "Postings stall, the alert fires."),
        ("**Owner** — the duty manager", "**Owner**: the duty manager"),
        ("Step 2 – verify the totals", "Step 2: verify the totals"),
        ("- Check the queue — then restart", "- Check the queue, then restart"),
        ("A real-time, pre-production cut-off; re-run it.", "A real time, preproduction cutoff; rerun it."),
        ("Ends with a dash —", "Ends with a dash"),
        ("TXN-001 and fingen-payments-oncall", "TXN-001 and fingen-payments-oncall"),
    ],
)
def test_normalise_dashes(text, expected):
    assert normalise_dashes(text) == expected


def test_normaliser_keeps_code_sql_and_urls_byte_identical():
    code = "```sql\nSELECT a -- note\nFROM t WHERE d >= NOW() - INTERVAL '1 day';\n```"
    inline = "`grep -- --pattern — x`"
    sql = "SELECT id FROM t WHERE x = 'a — b' AND d > NOW() - INTERVAL '2 hours';"
    url = "[docs](https://example.com/a--b)"
    text = f"The intro is short — now.\n\n{code}\n\nRun {inline} then {sql} See {url} — done."
    out = normalise_dashes(text)
    for span in (code, inline, sql, url):
        assert span in out
    assert out.startswith("The intro is short, now.") and out.endswith("done.")


# ── Full and incremental sync ───────────────────────────────


def test_full_sync_imports_fixtures(engine, mock):
    run_id = engine.run("full")
    run = run_row(run_id)
    assert run["status"] == "success" and run["articles_seen"] == 13 and run["articles_created"] == 12
    assert run["documents_downloaded"] == 5 and run["documents_rejected"] == 1
    assert "export-checklist.pdf rejected" in run["error_summary"]
    assert run["watermark"] == "2026-09-14 08:00:00"

    kb1 = article("KB0010001")
    assert (kb1["classification"], kb1["kind"], kb1["active"]) == ("internal", "runbook", 1)
    assert kb1["source_url"] == "https://example.service-now.com/kb_view.do?sysparm_article=KB0010001"
    assert kb1["body_raw_html"] == mock.find("KB0010001")["text"]  # source of truth kept untouched
    assert article("KB0010012")["classification"] == "restricted"  # unmapped value fails closed
    assert article("KB0010012")["source_classification"] == "Top Secret Ops"
    assert article("KB0010014")["active"] == 0  # past valid_to
    assert article("KB0010013") is None  # retired articles are outside the filter
    assert article("KB0010015") is None  # other knowledge base

    with connection() as conn:
        apps = conn.execute(
            "SELECT a.app_number, a.name FROM article_applications aa JOIN applications a ON a.id = aa.application_id "
            "JOIN kb_articles k ON k.id = aa.article_id WHERE k.kb_number = 'KB0010003'"
        ).fetchall()
        assert [tuple(r) for r in apps] == [("APM0001002", "Card Switch")]
        runbooks = conn.execute(
            "SELECT id, source, kb_article_id, classification FROM runbooks WHERE source = 'servicenow'"
        ).fetchall()
        assert len(runbooks) == 10 and all(r["id"] == db.RUNBOOK_ID_OFFSET + r["kb_article_id"] for r in runbooks)
        assert conn.execute("SELECT COUNT(1) FROM runbooks WHERE source = 'local'").fetchone()[0] == 25
        links = {
            tuple(r) for r in conn.execute("SELECT article_id, node_id FROM article_nodes WHERE origin = 'mapping'")
        }
        assert (kb1["id"], 4) in links and (kb1["id"], 15) in links
        docs = conn.execute(
            "SELECT storage_path, sha256, content_type FROM article_documents WHERE kind = 'attachment'"
        ).fetchall()
    for doc in docs:
        assert (engine.documents_dir / doc["storage_path"]).read_bytes()
        assert doc["storage_path"] == doc["sha256"]
    assert "application/pdf" in {d["content_type"] for d in docs}

    image = article("KB0010003")["body_markdown"]
    assert "](/api/knowledge/documents/" in image


def test_synced_display_text_has_no_dashes_but_code_is_kept(engine):
    engine.run("full")
    with connection() as conn:
        rows = conn.execute("SELECT title, summary, body_markdown FROM kb_articles").fetchall()
    for row in rows:
        for text in row:
            visible = prose(text, sql=True)
            visible = re.sub(r"\]\([^)]*\)", "]", visible)  # link targets are URLs, not prose
            assert not find(visible), (text, find(visible))
    body = article("KB0010006")["body_markdown"]
    assert "updated_at < NOW() - INTERVAL '30 minutes';" in body
    assert "5 to 10 minutes, the queue depth alert fires." in article("KB0010001")["body_markdown"]


def test_dataset_restart_does_not_touch_servicenow_runbooks(engine, client):
    engine.run("full")
    with connection() as conn:
        before = conn.execute("SELECT COUNT(1) FROM runbooks WHERE source = 'servicenow'").fetchone()[0]
    db.init_db()  # what a restart does
    with connection() as conn:
        assert conn.execute("SELECT COUNT(1) FROM runbooks WHERE source = 'servicenow'").fetchone()[0] == before


def test_incremental_fetches_only_changes_and_skips_unchanged(engine, mock):
    engine.run("full")
    mock.bump("KB0010005", short_description="Card Switch overview — revised")
    run = run_row(engine.run("incremental"))
    # The watermark filter is >=, so the article updated exactly at the watermark comes back unchanged.
    assert run["articles_seen"] == 2 and run["articles_updated"] == 1 and run["articles_unchanged"] == 1
    assert article("KB0010005")["title"] == "Card Switch overview, revised"
    again = run_row(engine.run("incremental"))
    assert again["articles_seen"] == 1 and again["articles_unchanged"] == 1 and again["articles_updated"] == 0
    assert again["watermark"] == run["watermark"]


def test_new_version_keeps_the_same_article(engine, mock):
    engine.run("full")
    old = article("KB0010007")
    record = mock.bump("KB0010007", short_description="Batch Scheduler daily schedule v2")
    record["sys_id"] = "a" + "0" * 28 + "999"
    engine.run("incremental")
    new = article("KB0010007")
    assert new["id"] == old["id"] and new["external_sys_id"] == record["sys_id"]


def test_full_sync_retires_missing_and_expired(engine, mock, config, tmp_path):
    engine.run("full")
    mock.records.remove(mock.find("KB0010007"))
    mock.find("KB0010002")["workflow_state"] = "retired"  # leaves the filter
    run = run_row(engine.run("full"))
    assert run["articles_retired"] == 2
    for number in ("KB0010007", "KB0010002"):
        row = article(number)
        assert row is not None and row["active"] == 0  # never hard deleted
    with connection() as conn:
        assert not conn.execute(
            "SELECT 1 FROM runbooks WHERE kb_article_id = ?", (article("KB0010007")["id"],)
        ).fetchone()
    later = SyncEngine(
        config,
        client_factory=lambda _c: mock,
        documents_dir=tmp_path / "docs",
        today=lambda: date(2101, 1, 1),
    )
    later.run("full")
    with connection() as conn:
        assert conn.execute("SELECT COUNT(1) FROM kb_articles WHERE active = 1").fetchone()[0] == 0


def test_one_bad_article_gives_a_partial_run(engine, mock):
    bad = mock.find("KB0010006")["sys_id"]
    original = mock.attachments

    def attachments(sys_id):
        if sys_id == bad:
            raise ServiceNowError("ServiceNow returned HTTP 500", 500)
        return original(sys_id)

    mock.attachments = attachments
    run = run_row(engine.run("full"))
    assert run["status"] == "partial" and run["articles_failed"] == 1 and run["articles_created"] == 11
    assert "KB0010006: ServiceNow returned HTTP 500" in run["error_summary"]
    assert run["watermark"] == mock.find("KB0010006")["sys_updated_on"]  # refetched next time
    mock.attachments = original
    retry = run_row(engine.run("incremental"))
    assert retry["status"] == "success" and article("KB0010006")["active"] == 1


def test_source_outage_fails_the_run_and_retires_nothing(engine, mock):
    engine.run("full")

    def down(*_a, **_k):
        raise ServiceNowError("ServiceNow unreachable (ConnectError)")

    mock.articles = down
    run = run_row(engine.run("full"))
    assert run["status"] == "failed" and run["watermark"] is None
    assert "unreachable" in run["error_summary"]
    with connection() as conn:
        assert conn.execute("SELECT COUNT(1) FROM kb_articles WHERE active = 1").fetchone()[0] == 12
    assert engine.last_watermark() == "2026-09-14 08:00:00"


def test_manual_node_links_survive_a_sync(engine):
    engine.run("full")
    kb5 = article("KB0010005")["id"]
    with connection() as conn:
        conn.execute("INSERT INTO article_nodes (article_id, node_id, origin) VALUES (?, 30, 'manual')", (kb5,))
    engine.run("full")
    with connection() as conn:
        assert conn.execute("SELECT 1 FROM article_nodes WHERE article_id = ? AND node_id = 30", (kb5,)).fetchone()


# ── Application sources ─────────────────────────────────────


def test_applications_from_article_fields(client, config, mock, tmp_path):
    raw = yaml.safe_load(config.settings.mapping_path.read_text(encoding="utf-8"))
    raw["applications"]["mode"] = "article_fields"
    mapping = parse_mapping(raw)
    for record in mock.records:
        record["u_application_number"] = "APM0009999"
        record["u_application_name"] = "Fixture App"
    mock.mapping = mapping
    cfg = copy.copy(config)
    object.__setattr__(cfg, "mapping", mapping)
    SyncEngine(cfg, client_factory=lambda _c: mock, documents_dir=tmp_path).run("full")
    with connection() as conn:
        assert [tuple(r) for r in conn.execute("SELECT app_number, name FROM applications")] == [
            ("APM0009999", "Fixture App")
        ]


def test_applications_from_m2m_table(client, config, mock, tmp_path):
    raw = yaml.safe_load(config.settings.mapping_path.read_text(encoding="utf-8"))
    raw["applications"]["mode"] = "m2m"
    mapping = parse_mapping(raw)
    kb1 = mock.find("KB0010001")["sys_id"]
    mock.tables["m2m_kb_ci"] = [
        {"kb_knowledge": kb1, "cmdb_ci": "c" + "0" * 30 + "1"},
        {"kb_knowledge": kb1, "cmdb_ci": "c" + "0" * 30 + "3"},
    ]
    mock.mapping = mapping
    cfg = copy.copy(config)
    object.__setattr__(cfg, "mapping", mapping)
    SyncEngine(cfg, client_factory=lambda _c: mock, documents_dir=tmp_path).run("full")
    with connection() as conn:
        numbers = conn.execute(
            "SELECT a.app_number FROM article_applications aa JOIN applications a ON a.id = aa.application_id "
            "ORDER BY a.app_number"
        ).fetchall()
    assert [r[0] for r in numbers] == ["APM0001001", "APM0001003"]


# ── Documents ───────────────────────────────────────────────


def _zip(names):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name in names:
            z.writestr(name, "x")
    return buf.getvalue()


def test_sniff_real_types():
    assert sniff(b"%PDF-1.7 ...") == "pdf"
    assert sniff(b"\x89PNG\r\n\x1a\nrest") == "png"
    assert sniff(b"\xff\xd8\xff\xe0rest") == "jpg"
    assert sniff(_zip(["[Content_Types].xml", "word/document.xml"])) == "docx"
    assert sniff(_zip(["[Content_Types].xml", "xl/workbook.xml"])) == "xlsx"
    assert sniff(_zip(["[Content_Types].xml", "ppt/presentation.xml"])) == "pptx"
    assert sniff(_zip(["evil.exe"])) is None  # a plain zip is not an Office file
    assert sniff(b"MZ\x90\x00binary") is None
    assert sniff(b"plain notes") == "txt"
    assert sniff(b"\xff\xfe\x00bad") is None


@pytest.mark.parametrize(
    "name,declared,size",
    [
        ("run.exe", "application/octet-stream", 10),
        ("notes.html", "text/html", 10),
        ("plan.pdf", "text/plain", 10),  # declared type contradicts the extension
        ("plan.pdf", "application/pdf", 2_000_000),  # over the limit before downloading
        ("sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 10),
    ],
)
def test_attachment_metadata_rejected(name, declared, size):
    allowed = ["pdf", "docx", "txt", "png", "jpg"]  # xlsx narrowed out by the mapping
    with pytest.raises(DocumentRejected):
        expected_type(name, declared, size, allowed, max_bytes=1_000_000)


def test_attachment_metadata_accepted():
    assert expected_type("Photo.JPEG", "image/jpg", 10, ["jpg"], 100) == "jpg"
    assert expected_type("a.txt", "text/plain; charset=utf-8", 10, ["txt"], 100) == "txt"


def test_oversized_download_is_rejected(engine, mock):
    engine.max_bytes = 100  # the fixture PDFs and DOCX are larger
    run = run_row(engine.run("full"))
    assert run["documents_downloaded"] == 2 and run["documents_rejected"] == 4  # txt and png fit
    assert "larger than the size limit" in run["error_summary"]


def test_stored_path_refuses_traversal(tmp_path):
    with pytest.raises(ValueError):
        stored_path(tmp_path, "../../app.db")
    assert stored_path(tmp_path, "a" * 64) == tmp_path / ("a" * 64)


# ── One run at a time ───────────────────────────────────────


def test_concurrent_run_is_refused(engine, mock):
    started, release = threading.Event(), threading.Event()
    original = mock.articles

    def slow(*args, **kwargs):
        started.set()
        release.wait(5)
        return original(*args, **kwargs)

    mock.articles = slow
    worker = threading.Thread(target=engine.run, args=("full",))
    worker.start()
    try:
        assert started.wait(5)
        with pytest.raises(SyncInProgress):
            engine.run("incremental")
    finally:
        release.set()
        worker.join(10)
    assert run_row(1)["status"] == "success"
    engine.run("incremental")  # the slot is free again


def test_running_row_from_another_process_blocks_until_stale(engine):
    now = utc_now()
    with connection() as conn:
        conn.execute(
            "INSERT INTO sync_runs (started_at, mode, status) VALUES (?, 'full', 'running')",
            (now.isoformat(),),
        )
    with pytest.raises(SyncInProgress):
        engine.run("incremental")
    with connection() as conn:
        conn.execute("UPDATE sync_runs SET started_at = ?", ((now - timedelta(hours=3)).isoformat(),))
    engine.run("incremental")
    SyncEngine.recover_interrupted()
    assert run_row(1)["status"] == "failed" and run_row(1)["error_summary"] == "Interrupted by a restart"


def test_scheduler_jobs_and_job_never_raises(engine):
    scheduler = start_scheduler(engine)
    try:
        times = next_run_times(scheduler)
        assert times["incremental"] and times["full"]
    finally:
        scheduler.shutdown(wait=False)
    assert next_run_times(None) == {"incremental": None, "full": None}
    handle = engine.begin("full")
    try:
        _job(engine, "incremental")  # skipped quietly while a run holds the slot
    finally:
        engine.execute(handle)
