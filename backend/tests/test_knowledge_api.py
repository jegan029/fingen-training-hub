"""Knowledge API and ServiceNow admin API: shapes, filters, paging, downloads, admin checks, CSRF."""

import pytest

from app.config import KB_DOCUMENTS_DIR
from app.db import connection
from app.main import app
from tests.conftest import ADMIN, LEARNER, login


@pytest.fixture()
def synced(client):
    app.state.servicenow_sync.run("full")
    return client


def article_id(number: str) -> int:
    with connection() as conn:
        return conn.execute("SELECT id FROM kb_articles WHERE kb_number = ?", (number,)).fetchone()["id"]


def document_id(file_name: str) -> int:
    with connection() as conn:
        return conn.execute("SELECT id FROM article_documents WHERE file_name = ?", (file_name,)).fetchone()["id"]


def set_clearance(email: str, level: str) -> None:
    with connection() as conn:
        conn.execute("UPDATE users SET max_classification = ? WHERE email = ?", (level, email))


def numbers(page: dict) -> list[str]:
    return [item["kb_number"] for item in page["items"]]


# ── Articles ────────────────────────────────────────────────


def test_list_is_limited_to_clearance_with_facets(synced):
    login(synced, LEARNER)
    page = synced.get("/api/knowledge/articles").json()
    assert page["total"] == 7 and page["page"] == 1 and page["page_size"] == 20
    assert {i["classification"] for i in page["items"]} == {"public", "internal"}
    assert {f["value"] for f in page["facets"]["classifications"]} == {"public", "internal"}
    assert {f["value"] for f in page["facets"]["kinds"]} == {"runbook", "sop", "other"}
    assert {f["label"] for f in page["facets"]["applications"]} == {
        "Ledger Gateway",
        "Card Switch",
        "Batch Scheduler",
        "Client Portal",
    }
    item = page["items"][0]
    assert item["source"] == "servicenow" and item["applications"] and "body_markdown" not in item


@pytest.mark.parametrize(
    "params,expected",
    [
        ({"q": "portal"}, {"KB0010009", "KB0010010"}),
        ({"q": "KB0010006"}, {"KB0010006"}),
        ({"q": "PENDING_GL"}, {"KB0010001"}),  # summary text; _ is matched literally
        ({"q": "100%"}, set()),
        ({"classification": "public"}, {"KB0010005", "KB0010007", "KB0010010"}),
        ({"classification": "restricted"}, set()),  # filtering never widens visibility
        ({"app_number": "APM0001003"}, {"KB0010006", "KB0010007"}),
        ({"article_type": "sop"}, {"KB0010002", "KB0010007"}),
        ({"category": "Reference"}, {"KB0010005", "KB0010010"}),
        ({"node_id": 16}, {"KB0010006", "KB0010007"}),
    ],
)
def test_list_filters(synced, params, expected):
    login(synced, LEARNER)
    assert set(numbers(synced.get("/api/knowledge/articles", params=params).json())) == expected


def test_list_filter_by_application_id(synced):
    login(synced, LEARNER)
    apps = {a["app_number"]: a["id"] for a in synced.get("/api/knowledge/applications").json()}
    page = synced.get("/api/knowledge/articles", params={"application_id": apps["APM0001001"]}).json()
    assert set(numbers(page)) == {"KB0010001", "KB0010002"}


def test_list_paging_and_sorting(synced):
    login(synced, LEARNER)
    by_updated = numbers(synced.get("/api/knowledge/articles").json())
    assert by_updated == sorted(by_updated, reverse=True)  # fixture numbers follow update order
    by_title = synced.get("/api/knowledge/articles", params={"sort": "title"}).json()["items"]
    assert [i["title"] for i in by_title] == sorted((i["title"] for i in by_title), key=str.lower)
    oldest = numbers(synced.get("/api/knowledge/articles", params={"order": "asc", "page_size": 3}).json())
    assert oldest == ["KB0010001", "KB0010002", "KB0010005"]
    second = synced.get("/api/knowledge/articles", params={"order": "asc", "page_size": 3, "page": 2}).json()
    assert numbers(second) == ["KB0010006", "KB0010007", "KB0010009"] and second["total"] == 7
    for bad in ({"page_size": 51}, {"page": 0}, {"sort": "random"}, {"classification": "secret"}):
        assert synced.get("/api/knowledge/articles", params=bad).status_code == 422


def test_article_detail(synced):
    login(synced, LEARNER)
    detail = synced.get(f"/api/knowledge/articles/{article_id('KB0010006')}").json()
    assert detail["kb_number"] == "KB0010006" and detail["llm_allowed"] is True
    assert "updated_at < NOW() - INTERVAL '30 minutes';" in detail["body_markdown"]
    assert "body_raw_html" not in detail and "content_hash" not in detail
    assert detail["source_url"] == "https://example.service-now.com/kb_view.do?sysparm_article=KB0010006"
    assert [d["file_name"] for d in detail["documents"]] == ["stuck-job-query.txt"]
    assert [a["kb_number"] for a in detail["linked_articles"]] == ["KB0010001"]
    assert {n["id"] for n in detail["related_nodes"]} == {16, 17}
    # KB0010009 links to an article outside the sync: it is not listed at all.
    assert synced.get(f"/api/knowledge/articles/{article_id('KB0010009')}").json()["linked_articles"] == []


@pytest.mark.parametrize("number", ["KB0010003", "KB0010004", "KB0010012", "KB0010014"])
def test_hidden_or_inactive_article_is_404_like_missing(synced, number):
    login(synced, LEARNER)
    hidden = synced.get(f"/api/knowledge/articles/{article_id(number)}")
    missing = synced.get("/api/knowledge/articles/999999")
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json() == {"detail": "Article not found"}
    assert synced.get(f"/api/knowledge/articles/by-number/{number}").status_code == 404


def test_lookup_by_number(synced):
    login(synced, LEARNER)
    res = synced.get("/api/knowledge/articles/by-number/kb0010001")
    assert res.status_code == 200 and res.json() == {"id": article_id("KB0010001")}


def test_admin_detail_reports_llm_refusal_and_is_audited(synced):
    login(synced, ADMIN)
    detail = synced.get(f"/api/knowledge/articles/{article_id('KB0010004')}").json()
    assert detail["classification"] == "restricted" and detail["llm_allowed"] is False
    entries = synced.get("/api/admin/servicenow/audit").json()
    assert entries[0]["kb_number"] == "KB0010004" and entries[0]["action"] == "view"


# ── Applications ────────────────────────────────────────────


def test_applications_with_counts_per_clearance(synced):
    login(synced, LEARNER)
    apps = {a["app_number"]: a for a in synced.get("/api/knowledge/applications").json()}
    assert apps["APM0001001"]["counts"] == {"runbooks": 1, "sops": 1, "other": 0, "documents": 2}
    assert apps["APM0001002"]["counts"] == {"runbooks": 0, "sops": 0, "other": 1, "documents": 0}
    login(synced, ADMIN)
    admin_apps = {a["app_number"]: a for a in synced.get("/api/knowledge/applications").json()}
    assert admin_apps["APM0001002"]["counts"] == {"runbooks": 1, "sops": 1, "other": 1, "documents": 2}


def test_application_detail_groups_articles(synced):
    login(synced, LEARNER)
    apps = {a["app_number"]: a["id"] for a in synced.get("/api/knowledge/applications").json()}
    detail = synced.get(f"/api/knowledge/applications/{apps['APM0001001']}").json()
    assert [a["kb_number"] for a in detail["runbooks"]] == ["KB0010001"]
    assert [a["kb_number"] for a in detail["sops"]] == ["KB0010002"]
    assert detail["other"] == []
    assert {d["file_name"] for d in detail["documents"]} == {"posting-flow.pdf", "month-end-checklist.docx"}


def test_application_without_visible_articles_is_hidden(synced):
    login(synced, ADMIN)
    apps = {a["app_number"]: a["id"] for a in synced.get("/api/knowledge/applications").json()}
    set_clearance(LEARNER[0], "public")
    login(synced, LEARNER)
    listed = {a["app_number"] for a in synced.get("/api/knowledge/applications").json()}
    assert "APM0001001" not in listed  # only internal and restricted articles
    assert synced.get(f"/api/knowledge/applications/{apps['APM0001001']}").status_code == 404
    assert synced.get("/api/knowledge/applications/999").status_code == 404


# ── Downloads ───────────────────────────────────────────────


def test_download_streams_verified_file_as_attachment(synced):
    login(synced, LEARNER)
    res = synced.get(f"/api/knowledge/documents/{document_id('posting-flow.pdf')}/download")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.headers["content-disposition"] == 'attachment; filename="posting-flow.pdf"'
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["content-security-policy"].startswith("default-src 'none'")
    assert res.content.startswith(b"%PDF-")
    docx = synced.get(f"/api/knowledge/documents/{document_id('month-end-checklist.docx')}/download")
    assert docx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_download_access_checks(synced):
    login(synced, LEARNER)
    for name in ("key-ceremony.pdf", "timeout-dashboard.png"):  # restricted and confidential articles
        assert synced.get(f"/api/knowledge/documents/{document_id(name)}/download").status_code == 404
    assert synced.get("/api/knowledge/documents/99999/download").status_code == 404
    with connection() as conn:
        linked = conn.execute("SELECT id FROM article_documents WHERE kind = 'linked_article'").fetchone()["id"]
    assert synced.get(f"/api/knowledge/documents/{linked}/download").status_code == 404
    with connection() as conn:
        conn.execute("UPDATE kb_articles SET active = 0 WHERE kb_number = 'KB0010001'")
    assert synced.get(f"/api/knowledge/documents/{document_id('posting-flow.pdf')}/download").status_code == 404


def test_download_of_missing_file_or_bad_path_is_404(synced):
    login(synced, LEARNER)
    doc = document_id("stuck-job-query.txt")
    with connection() as conn:
        conn.execute("UPDATE article_documents SET storage_path = '../app.db' WHERE id = ?", (doc,))
    assert synced.get(f"/api/knowledge/documents/{doc}/download").status_code == 404
    with connection() as conn:
        conn.execute("UPDATE article_documents SET storage_path = ? WHERE id = ?", ("0" * 64, doc))
    assert not (KB_DOCUMENTS_DIR / ("0" * 64)).exists()
    assert synced.get(f"/api/knowledge/documents/{doc}/download").status_code == 404


def test_confidential_download_is_audited(synced):
    login(synced, ADMIN)
    assert synced.get(f"/api/knowledge/documents/{document_id('timeout-dashboard.png')}/download").status_code == 200
    entry = synced.get("/api/admin/servicenow/audit").json()[0]
    assert (entry["action"], entry["document_name"], entry["kb_number"]) == (
        "download",
        "timeout-dashboard.png",
        "KB0010003",
    )


# ── Search ──────────────────────────────────────────────────


def test_search_includes_knowledge_within_clearance(synced):
    login(synced, LEARNER)
    results = synced.get("/api/search", params={"q": "card"}).json()
    kinds = {(r["kind"], r["title"]) for r in results}
    assert ("article", "Card Switch overview") in kinds and ("application", "Card Switch") in kinds
    assert not any(r["title"] == "Card Switch key rotation" for r in results)
    assert synced.get("/api/search", params={"q": "key-ceremony"}).json() == []
    runbook = next(
        r for r in synced.get("/api/search", params={"q": "posting failure"}).json() if r["kind"] == "runbook"
    )
    assert runbook["url"] == f"/knowledge/{article_id('KB0010001')}"
    login(synced, ADMIN)
    docs = [r for r in synced.get("/api/search", params={"q": "key-ceremony"}).json() if r["kind"] == "document"]
    assert docs and docs[0]["url"] == f"/knowledge/{article_id('KB0010004')}"


# ── Learner status banner ───────────────────────────────────


def test_status_reports_stale_and_unreachable(client):
    login(client, LEARNER)
    assert client.get("/api/knowledge/status").json() == {
        "enabled": True,
        "stale": True,  # never synced
        "unreachable": False,
        "last_success_at": None,
    }
    app.state.servicenow_sync.run("full")
    fresh = client.get("/api/knowledge/status").json()
    assert fresh["stale"] is False and fresh["last_success_at"]
    with connection() as conn:
        conn.execute(
            "INSERT INTO sync_runs (started_at, finished_at, mode, status) VALUES ('x', 'y', 'incremental', 'failed')"
        )
    down = client.get("/api/knowledge/status").json()
    assert down["unreachable"] is True and down["stale"] is False  # cached content still current


def test_knowledge_api_needs_a_session(client):
    for path in ("/api/knowledge/articles", "/api/knowledge/applications", "/api/knowledge/status"):
        assert client.get(path).status_code == 401


# ── Admin ───────────────────────────────────────────────────


ADMIN_GETS = [
    "/api/admin/servicenow/status",
    "/api/admin/servicenow/runs",
    "/api/admin/servicenow/mapping",
    "/api/admin/servicenow/audit",
]


def test_admin_endpoints_are_admin_only(synced):
    login(synced, LEARNER)
    for path in ADMIN_GETS:
        assert synced.get(path).status_code == 403
    assert synced.post("/api/admin/servicenow/sync").status_code == 403
    assert synced.post(f"/api/admin/servicenow/articles/{article_id('KB0010001')}/nodes/1").status_code == 403


def test_manual_sync_runs_in_background_and_is_recorded(client):
    login(client, ADMIN)
    res = client.post("/api/admin/servicenow/sync", params={"mode": "full"})
    assert res.status_code == 202 and res.json()["status"] == "running"
    run = client.get(f"/api/admin/servicenow/runs/{res.json()['run_id']}").json()
    assert run["status"] == "success" and run["articles_created"] == 12 and run["mode"] == "full"
    assert client.get("/api/admin/servicenow/runs").json()[0]["id"] == run["id"]
    assert client.get("/api/admin/servicenow/runs/999").status_code == 404
    assert client.post("/api/admin/servicenow/sync", params={"mode": "everything"}).status_code == 422


def test_sync_conflict_and_csrf(client):
    login(client, ADMIN)
    handle = app.state.servicenow_sync.begin("full")
    try:
        res = client.post("/api/admin/servicenow/sync")
        assert res.status_code == 409 and res.json() == {"detail": "A sync is already running"}
        assert client.get("/api/admin/servicenow/status").json()["running"] is True
    finally:
        app.state.servicenow_sync.execute(handle)
    del client.headers["X-Requested-With"]
    try:
        assert client.post("/api/admin/servicenow/sync").status_code == 403
    finally:
        client.headers["X-Requested-With"] = "fetch"


def test_sync_when_integration_disabled(client, monkeypatch):
    login(client, ADMIN)
    monkeypatch.setattr(app.state, "servicenow_sync", None)
    assert client.post("/api/admin/servicenow/sync").status_code == 409


def test_status_shape_has_no_secrets(synced, monkeypatch):
    login(synced, ADMIN)
    status = synced.get("/api/admin/servicenow/status").json()
    assert status["enabled"] and status["mock_mode"] and status["instance_host"] is None
    assert status["counts"]["articles_active"] == 12 and status["counts"]["documents"] == 5
    assert status["counts"]["by_classification"] == {"public": 3, "internal": 4, "confidential": 2, "restricted": 3}
    assert status["last_run"]["status"] == "success"
    text = str(status) + str(synced.get("/api/admin/servicenow/mapping").json())
    for secret_word in ("secret", "password", "token"):
        assert secret_word not in text.lower()


def test_mapping_view(synced):
    login(synced, ADMIN)
    mapping = synced.get("/api/admin/servicenow/mapping").json()
    assert mapping["source_table"] == "kb_knowledge" and mapping["applications"]["mode"] == "cmdb_ci"


def test_manual_node_links(synced):
    login(synced, ADMIN)
    kb5 = article_id("KB0010005")
    res = synced.post(f"/api/admin/servicenow/articles/{kb5}/nodes/30")
    assert res.status_code == 200 and res.json() == {"article_id": kb5, "node_id": 30, "linked": True}
    login(synced, LEARNER)
    assert "KB0010005" in numbers(synced.get("/api/knowledge/articles", params={"node_id": 30}).json())
    login(synced, ADMIN)
    assert synced.delete(f"/api/admin/servicenow/articles/{kb5}/nodes/30").json()["linked"] is False
    assert "KB0010005" not in numbers(synced.get("/api/knowledge/articles", params={"node_id": 30}).json())
    assert synced.post(f"/api/admin/servicenow/articles/{kb5}/nodes/999").status_code == 404
    set_clearance(ADMIN[0], "internal")
    restricted = article_id("KB0010004")
    assert synced.post(f"/api/admin/servicenow/articles/{restricted}/nodes/1").status_code == 404
    del synced.headers["X-Requested-With"]
    try:
        assert synced.delete(f"/api/admin/servicenow/articles/{kb5}/nodes/30").status_code == 403
    finally:
        synced.headers["X-Requested-With"] = "fetch"
