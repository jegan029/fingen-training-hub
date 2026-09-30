import sqlite3
from datetime import date

from app.config import DB_PATH
from app.services.progress_service import current_streak

LEARNER_ID = 7


def _add_scores(*rows):
    """Insert open ended assessment rows (node_id, score, category) for the learner."""
    conn = sqlite3.connect(DB_PATH)
    conn.executemany(
        "INSERT INTO assessments (user_id, node_id, answer, score, feedback, category) VALUES (?, ?, 'a', ?, 'f', ?)",
        [(LEARNER_ID, node, score, category) for node, score, category in rows],
    )
    conn.commit()
    conn.close()


def _mark_all_done(client):
    for node_id in range(1, 31):  # ascending ids satisfy every dependency, including node 20 on node 5
        assert client.put(f"/api/progress/node/{node_id}", json={"status": "done"}).status_code == 200


# ── Search ──────────────────────────────────────────────────


def test_search_requires_login(client):
    assert client.get("/api/search", params={"q": "settlement"}).status_code == 401


def test_search_finds_every_kind_with_links(learner_client):
    results = learner_client.get("/api/search", params={"q": "a"}).json()
    assert results == []  # below the minimum length

    kinds = set()
    for q in ("platform", "settlement", "incident"):
        for r in learner_client.get("/api/search", params={"q": q}).json():
            kinds.add(r["kind"])
            assert r["url"].startswith(("/roadmaps/", "/runbooks?open="))
    assert {"path", "node", "runbook"} <= kinds


def test_search_matches_wildcards_literally(learner_client):
    assert learner_client.get("/api/search", params={"q": "%%"}).json() == []
    assert learner_client.get("/api/search", params={"q": "__"}).json() == []


def test_search_rejects_overlong_query(learner_client):
    assert learner_client.get("/api/search", params={"q": "x" * 101}).status_code == 422


# ── Summary: streak and continue ────────────────────────────


def test_streak_counts_consecutive_days_ending_today_or_yesterday():
    today = date(2026, 9, 30)
    assert current_streak([], today) == 0
    assert current_streak([date(2026, 9, 30), date(2026, 9, 29), date(2026, 9, 27)], today) == 2
    assert current_streak([date(2026, 9, 29), date(2026, 9, 28)], today) == 2  # today not yet active
    assert current_streak([date(2026, 9, 28)], today) == 0


def test_summary_for_a_new_learner_points_at_the_first_node(learner_client):
    summary = learner_client.get("/api/progress/summary").json()
    assert summary["streak_days"] == 0
    assert summary["last_active"] is None
    assert summary["continue_node"]["node_id"] == 1
    assert summary["continue_node"]["reason"] == "start"


def test_summary_prefers_in_progress_then_next_open_node(learner_client):
    learner_client.put("/api/progress/node/1", json={"status": "done"})
    summary = learner_client.get("/api/progress/summary").json()
    assert summary["streak_days"] == 1
    assert summary["continue_node"]["reason"] == "next"
    assert summary["continue_node"]["node_id"] == 2

    learner_client.put("/api/progress/node/11", json={"status": "in_progress"})
    summary = learner_client.get("/api/progress/summary").json()
    assert summary["continue_node"] == {
        **summary["continue_node"],
        "node_id": 11,
        "reason": "in_progress",
        "status": "in_progress",
    }


def test_summary_is_empty_when_everything_is_done(learner_client):
    _mark_all_done(learner_client)
    assert learner_client.get("/api/progress/summary").json()["continue_node"] is None


# ── Certificate ─────────────────────────────────────────────


def test_certificate_requires_login(client):
    assert client.get("/api/certificate").status_code == 401


def test_certificate_lists_what_is_missing(learner_client):
    cert = learner_client.get("/api/certificate").json()
    assert cert["eligible"] is False
    assert cert["awarded_on"] is None
    assert len(cert["missing"]) == 4  # three paths plus the assessment requirement
    assert all(p["completed"] == 0 and p["total"] == 10 for p in cert["paths"])


def test_certificate_needs_the_minimum_average(learner_client):
    _mark_all_done(learner_client)
    _add_scores((1, 5, "Partial"), (2, 6, "Partial"))
    cert = learner_client.get("/api/certificate").json()
    assert cert["eligible"] is False
    assert cert["average_score"] == 5.5
    assert cert["missing"] == ["Raise your assessment average from 5.5 to 7 or more"]


def test_certificate_uses_best_score_per_node_and_ignores_unavailable(learner_client):
    _mark_all_done(learner_client)
    _add_scores((1, 4, "Partial"), (1, 9, "Excellent"), (2, 7, "Good"), (3, 0, "Unavailable"))
    cert = learner_client.get("/api/certificate").json()
    assert cert["average_score"] == 8.0
    assert cert["assessed_nodes"] == 2
    assert cert["eligible"] is True
    assert cert["missing"] == []
    assert date.fromisoformat(cert["awarded_on"])  # date of the last node marked done


def test_skipped_nodes_do_not_earn_the_certificate(learner_client):
    _mark_all_done(learner_client)
    learner_client.put("/api/progress/node/30", json={"status": "skipped"})
    _add_scores((1, 10, "Excellent"))
    cert = learner_client.get("/api/certificate").json()
    assert cert["eligible"] is False
    assert cert["missing"] == ["L2 Support Operations: 1 more topic to mark done"]


# ── Admin: weakest topics ───────────────────────────────────


def test_weakest_topics_is_admin_only(learner_client):
    assert learner_client.get("/api/admin/weakest-topics").status_code == 403


def test_weakest_topics_sorted_lowest_first(admin_client):
    topics = admin_client.get("/api/admin/weakest-topics", params={"limit": 5}).json()
    assert 0 < len(topics) <= 5
    averages = [t["average_score"] for t in topics]
    assert averages == sorted(averages)
    assert all(t["attempts"] >= 1 and t["learners"] >= 1 for t in topics)
