import sqlite3

import pytest

from app.config import DB_PATH
from app.db import SCHEMA_SQL, init_db
from app.services.subtopics import extract_subtopics

from .conftest import ADMIN, LEARNER, login

# ── Subtopic extractor ──────────────────────────────────────


def test_subtopics_come_from_headings_and_skip_overview():
    content = (
        "## Overview\nIntro text.\n\n"
        "## Architecture Tiers\n- **Presentation Layer**: React portal and `REST` API\n- Data layer\n\n"
        "## Settlement Cycle\n```\nAUTHORISED -> SETTLED\n```\n\n"
        "## Ingestion Sources\n| Source | Type |\n|---|---|\n| CBS | Balances |\n| Clearing | Files |\n\n"
        "## Queries\n```sql\n-- Full transaction detail\nSELECT 1;\n-- Status history\nSELECT 2;\n```\n"
    )
    assert extract_subtopics(content) == [
        {"title": "Architecture Tiers", "summary": "Presentation Layer: React portal and REST API"},
        {"title": "Settlement Cycle", "summary": "AUTHORISED -> SETTLED"},
        {"title": "Ingestion Sources", "summary": "CBS, Clearing"},
        {"title": "Queries", "summary": "Full transaction detail, Status history"},
    ]


def test_subtopic_summary_is_first_sentence_and_clipped():
    long = "word " * 60
    subs = extract_subtopics(f"## A\nFirst sentence. Second sentence.\n\n## B\n{long}")
    assert subs[0]["summary"] == "First sentence."
    assert len(subs[1]["summary"]) <= 160 and subs[1]["summary"].endswith("…")


def test_subtopics_fall_back_to_prose_lists():
    subs = extract_subtopics("This module covers settlement cycles, netting rules, and cutoff times.")
    assert [s["title"] for s in subs] == ["settlement cycles", "netting rules", "cutoff times"]
    assert extract_subtopics("") == []


# ── Migration from the old progress schema ──────────────────


def test_completed_flag_migrates_to_done_status(client):
    DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_SQL)  # user_version 0: the original schema
    conn.execute("INSERT INTO users (id, name, email) VALUES (50, 'Old User', 'old@fingen.demo')")
    conn.execute("INSERT INTO progress (user_id, node_id, completed, completed_at) VALUES (50, 1, 1, '2026-01-01')")
    conn.execute("INSERT INTO progress (user_id, node_id, completed, completed_at) VALUES (50, 2, 0, NULL)")
    conn.commit()
    conn.close()
    init_db()
    conn = sqlite3.connect(DB_PATH)
    rows = dict(conn.execute("SELECT node_id, status FROM progress WHERE user_id = 50").fetchall())
    columns = {r[1] for r in conn.execute("PRAGMA table_info(progress)")}
    conn.close()
    assert rows == {1: "done", 2: "pending"}
    assert "completed" not in columns and {"status", "updated_at"} <= columns


# ── Roadmap API ─────────────────────────────────────────────


def _nodes(client, path_id=1):
    return {n["id"]: n for n in client.get(f"/api/roadmaps/{path_id}").json()}


def test_roadmap_nodes_include_status_subtopics_and_runbooks(learner_client):
    nodes = _nodes(learner_client)
    assert len(nodes) == 10
    node2 = nodes[2]
    assert node2["status"] == "pending" and node2["locked"] is True
    assert node2["locked_by"] == ["Platform Architecture"]
    assert node2["subtopics"] and all({"id", "title", "summary"} <= set(s) for s in node2["subtopics"])
    assert "Overview" not in [s["title"] for s in node2["subtopics"]]
    assert [r["title"] for r in node2["runbooks"]] == ["User Access Troubleshooting", "RBAC Permission Audit"]
    assert nodes[1]["runbooks"] == []  # Platform Architecture has no linked runbook


def test_set_status_cycle_and_progress_counts(learner_client):
    for status in ("in_progress", "done", "pending", "done"):
        res = learner_client.put("/api/progress/node/1", json={"status": status})
        assert res.status_code == 200 and res.json()["status"] == status
    assert _nodes(learner_client)[1]["status"] == "done"
    progress = learner_client.get("/api/progress/path/1").json()["progress"]
    assert progress["completed"] == 1 and progress["total"] == 10


def test_invalid_status_is_rejected(learner_client):
    assert learner_client.put("/api/progress/node/1", json={"status": "finished"}).status_code == 422


def test_unknown_node_returns_404(learner_client):
    assert learner_client.put("/api/progress/node/9999", json={"status": "done"}).status_code == 404


@pytest.mark.parametrize("status", ["done", "in_progress", "skipped"])
def test_locked_node_rejects_status_changes(learner_client, status):
    res = learner_client.put("/api/progress/node/2", json={"status": status})
    assert res.status_code == 409
    assert "Platform Architecture" in res.json()["detail"]


def test_locked_node_can_be_reset(learner_client):
    assert learner_client.put("/api/progress/node/2", json={"status": "pending"}).status_code == 200


def test_skipped_unlocks_dependents_but_is_not_done(learner_client):
    learner_client.put("/api/progress/node/1", json={"status": "skipped"})
    nodes = _nodes(learner_client)
    assert nodes[2]["locked"] is False
    progress = learner_client.get("/api/progress/path/1").json()["progress"]
    assert progress["completed"] == 0 and progress["skipped"] == 1


def test_in_progress_does_not_unlock_dependents(learner_client):
    learner_client.put("/api/progress/node/1", json={"status": "in_progress"})
    assert _nodes(learner_client)[2]["locked"] is True


def test_node_status_is_per_user(client):
    login(client, LEARNER)
    client.put("/api/progress/node/1", json={"status": "done"})
    client.post("/api/auth/logout")
    login(client, ADMIN)
    assert _nodes(client)[1]["status"] == "pending"


def test_complete_shortcut_sets_done(learner_client):
    assert learner_client.post("/api/progress/complete", json={"node_id": 1}).status_code == 200
    assert _nodes(learner_client)[1]["status"] == "done"


def test_node_detail_includes_status(learner_client):
    learner_client.put("/api/progress/node/1", json={"status": "in_progress"})
    node = learner_client.get("/api/roadmaps/node/1").json()
    assert node["status"] == "in_progress" and node["completed"] is False and node["content"]


# ── Runbooks API ────────────────────────────────────────────


def test_runbooks_list_and_detail(learner_client):
    runbooks = learner_client.get("/api/runbooks/").json()
    assert len(runbooks) == 25
    assert all(r["node_ids"] for r in runbooks), "every runbook is linked to at least one node"
    first = learner_client.get(f"/api/runbooks/{runbooks[0]['id']}").json()
    assert first["title"] == "Transaction Investigation & Resubmit"
    assert first["steps"] and first["preconditions"] and first["escalation_triggers"]
    assert 4 in first["node_ids"]


def test_runbook_steps_are_preserved_verbatim(learner_client):
    runbook = learner_client.get("/api/runbooks/1").json()
    assert runbook["steps"][0].startswith("Retrieve the transaction ID from the ticket. Run: SELECT txn_id")


def test_unknown_runbook_returns_404(learner_client):
    assert learner_client.get("/api/runbooks/999").status_code == 404


def test_runbooks_require_login(client):
    assert client.get("/api/runbooks/").status_code == 401


def test_prerequisites_include_other_paths_with_status(learner_client):
    node20 = _nodes(learner_client, 2)[20]
    prereqs = {p["id"]: p for p in node20["prerequisites"]}
    assert prereqs[5]["title"] == "Reporting Suite" and prereqs[5]["path_id"] == 1
    assert prereqs[16]["path_id"] == 2 and prereqs[16]["status"] == "pending"
    assert set(node20["locked_by"]) == {"Reporting Suite", "Batch Processing"}
