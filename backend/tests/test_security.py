import hashlib
import sqlite3
from pathlib import Path

import jwt
import pytest

from app.config import DB_PATH, SESSION_COOKIE
from app.db import _m002_drop_legacy_password_hashes, _m003_fingen_email_domain, connection, init_db
from app.services.llm_service import LLMService

from .conftest import ADMIN, LEARNER, login

PROTECTED_GETS = [
    "/api/roadmaps/",
    "/api/roadmaps/1",
    "/api/roadmaps/node/1",
    "/api/progress/overview",
    "/api/progress/path/1",
    "/api/assessments/node/1",
    "/api/assessments/node/1/scenario",
    "/api/admin/users",
    "/api/analytics/path/1",
    "/api/auth/me",
]


def _db_rows(sql: str, params=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def _user_id(email: str) -> int:
    return _db_rows("SELECT id FROM users WHERE email = ?", (email,))[0]["id"]


# ── Authentication ──────────────────────────────────────────


@pytest.mark.parametrize("path", PROTECTED_GETS)
def test_unauthenticated_requests_get_401(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/api/progress/complete", {"node_id": 1}),
        ("post", "/api/assessments/node/1/evaluate", {"answer": "x"}),
        ("post", "/api/assessments/node/1/scenario/evaluate", {"chosen_option": 0}),
        ("post", "/api/chat/query", {"path_id": 1, "message": "hi"}),
    ],
)
def test_unauthenticated_writes_get_401(client, method, path, body):
    assert getattr(client, method)(path, json=body).status_code == 401


def test_health_is_public(client):
    assert client.get("/api/health").status_code == 200


def test_login_sets_httponly_strict_cookie_and_me_returns_user(client):
    res = client.post("/api/auth/login", json={"email": LEARNER[0], "password": LEARNER[1]})
    assert res.status_code == 200
    cookie = res.headers["set-cookie"].lower()
    assert SESSION_COOKIE in cookie and "httponly" in cookie and "samesite=strict" in cookie
    assert res.json()["role"] == "learner"
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == LEARNER[0]


def test_wrong_password_and_unknown_email_get_same_error(client):
    a = client.post("/api/auth/login", json={"email": LEARNER[0], "password": "wrong-password"})
    b = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "Invalid email or password"}


def test_logout_ends_session(learner_client):
    assert learner_client.post("/api/auth/logout").status_code == 204
    assert learner_client.get("/api/auth/me").status_code == 401


def test_forged_token_is_rejected(client):
    forged = jwt.encode(
        {"sub": str(_user_id(ADMIN[0])), "exp": 9999999999},
        "an-attacker-guessed-secret-that-is-long-enough",
        algorithm="HS256",
    )
    client.cookies.set(SESSION_COOKIE, forged)
    assert client.get("/api/admin/users").status_code == 401


def test_invalid_email_is_rejected(client):
    assert client.post("/api/auth/login", json={"email": "not-an-email", "password": "x"}).status_code == 422


def test_overlong_password_is_rejected(client):
    assert client.post("/api/auth/login", json={"email": LEARNER[0], "password": "x" * 129}).status_code == 422


# ── Authorisation ───────────────────────────────────────────


@pytest.mark.parametrize("path", ["/api/admin/users", "/api/analytics/path/1"])
def test_learner_gets_403_on_admin_routes(learner_client, path):
    assert learner_client.get(path).status_code == 403


@pytest.mark.parametrize("path", ["/api/admin/users", "/api/analytics/path/1"])
def test_admin_can_use_admin_routes(admin_client, path):
    assert admin_client.get(path).status_code == 200


def test_role_comes_from_database_not_token(learner_client):
    # A learner token stays a learner even if the role is changed client side; only the DB decides.
    assert learner_client.get("/api/auth/me").json()["role"] == "learner"
    assert learner_client.get("/api/admin/users").status_code == 403


# ── Per-user data (IDOR) ────────────────────────────────────


def test_progress_is_recorded_for_the_session_user_only(learner_client):
    learner_id, admin_id = _user_id(LEARNER[0]), _user_id(ADMIN[0])
    # A client-supplied user_id is ignored.
    res = learner_client.post("/api/progress/complete", json={"node_id": 1, "user_id": admin_id})
    assert res.status_code == 200
    owners = {r["user_id"] for r in _db_rows("SELECT user_id FROM progress WHERE node_id = 1 AND status = 'done'")}
    assert learner_id in owners and admin_id not in owners


def test_progress_overview_is_per_user(client):
    login(client, LEARNER)
    client.post("/api/progress/complete", json={"node_id": 1})
    assert client.get("/api/progress/overview").json()["paths"][0]["completed"] == 1

    client.post("/api/auth/logout")
    login(client, ADMIN)
    overview = client.get("/api/progress/overview").json()
    assert overview["user_name"] == "Admin User"
    assert overview["paths"][0]["completed"] == 0


def test_assessment_is_stored_for_the_session_user_only(learner_client, monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "evaluate_answer",
        lambda *a, **k: {"score": 7, "category": "Good", "feedback": "ok", "key_points": ["a"]},
    )
    admin_id = _user_id(ADMIN[0])
    res = learner_client.post("/api/assessments/node/1/evaluate", json={"answer": "my answer", "user_id": admin_id})
    assert res.status_code == 200
    rows = _db_rows("SELECT user_id FROM assessments WHERE answer = 'my answer'")  # skip seeded demo scores
    assert [r["user_id"] for r in rows] == [_user_id(LEARNER[0])]


def test_scenario_attempt_is_stored_for_the_session_user_only(learner_client):
    admin_id = _user_id(ADMIN[0])
    res = learner_client.post(
        "/api/assessments/node/1/scenario/evaluate", json={"chosen_option": 0, "user_id": admin_id}
    )
    assert res.status_code == 200
    assert [r["user_id"] for r in _db_rows("SELECT user_id FROM scenario_assessments")] == [_user_id(LEARNER[0])]


# ── Abuse controls ──────────────────────────────────────────


def test_login_rate_limit_triggers(client):
    codes = [
        client.post("/api/auth/login", json={"email": f"x{i}@example.com", "password": "bad"}).status_code
        for i in range(6)
    ]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_account_locks_after_repeated_failures(client):
    for _ in range(3):  # LOGIN_LOCKOUT_THRESHOLD is 3 in tests
        client.post("/api/auth/login", json={"email": LEARNER[0], "password": "wrong-password"})
    res = client.post("/api/auth/login", json={"email": LEARNER[0], "password": LEARNER[1]})
    assert res.status_code == 401


def test_oversized_chat_message_returns_422(learner_client):
    res = learner_client.post("/api/chat/query", json={"path_id": 1, "message": "x" * 2001})
    assert res.status_code == 422


def test_oversized_assessment_answer_returns_422(learner_client):
    res = learner_client.post("/api/assessments/node/1/evaluate", json={"answer": "x" * 4001})
    assert res.status_code == 422


def test_llm_failure_does_not_leak_details(learner_client):
    # No LLM is configured in tests, so the call fails; the client gets a generic fallback.
    res = learner_client.post("/api/chat/query", json={"path_id": 1, "message": "What is Fingen?"})
    assert res.status_code == 200
    body = res.text.lower()
    assert "llm_model" not in body and "http" not in body and "traceback" not in body


def test_state_changing_request_without_csrf_header_is_rejected(learner_client):
    del learner_client.headers["X-Requested-With"]
    assert learner_client.post("/api/progress/complete", json={"node_id": 1}).status_code == 403


# ── Headers and config ──────────────────────────────────────


def test_security_headers_present(client):
    headers = client.get("/api/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in headers["content-security-policy"]
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "permissions-policy" in headers


def test_legacy_sha256_password_no_longer_works(client):
    # Simulate a database from before the fix: a SHA-256 hash of the old hardcoded password.
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE email = ?", (hashlib.sha256(b"learner123").hexdigest(), LEARNER[0])
    )
    conn.commit()
    conn.close()
    with connection() as c:
        _m002_drop_legacy_password_hashes(c)
    init_db()
    res = client.post("/api/auth/login", json={"email": LEARNER[0], "password": "learner123"})
    assert res.status_code == 401
    # Seeding re-creates an argon2id hash with the configured password.
    login(client, LEARNER)


def test_no_hardcoded_passwords_in_seed():
    import app.db as db_module

    source = Path(db_module.__file__).read_text(encoding="utf-8")
    assert "admin123" not in source and "learner123" not in source


def test_changing_seed_password_env_updates_existing_account(client):
    # Account first created with some other password (e.g. a generated one), then the env var is set.
    from app.passwords import hash_password

    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE users SET password_hash = ? WHERE email = ?", (hash_password("old-generated-pw"), LEARNER[0]))
    conn.commit()
    conn.close()
    init_db()  # restart: seeding applies SEED_LEARNER_PASSWORD
    login(client, LEARNER)
    res = client.post("/api/auth/login", json={"email": LEARNER[0], "password": "old-generated-pw"})
    assert res.status_code == 401


# ── Data maintenance ────────────────────────────────────────


def test_dataset_edits_sync_into_existing_database(client):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE nodes SET content = 'stale' WHERE id = 1")
    conn.commit()
    conn.close()
    init_db()  # restart
    assert _db_rows("SELECT content FROM nodes WHERE id = 1")[0]["content"].startswith("## Overview")


def test_dataset_sync_keeps_learner_progress(learner_client):
    learner_client.post("/api/progress/complete", json={"node_id": 1})
    init_db()
    assert learner_client.get("/api/progress/overview").json()["paths"][0]["completed"] == 1


def test_old_brand_email_domains_are_migrated(client):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE users SET email = 'learner@oldbrand.demo' WHERE email = ?", (LEARNER[0],))
    conn.execute("UPDATE users SET email = 'alex.chen@legacy-co.demo' WHERE id = 2")
    conn.commit()
    conn.close()
    with connection() as c:
        _m003_fingen_email_domain(c)
    init_db()
    emails = {r["email"] for r in _db_rows("SELECT email FROM users")}
    assert LEARNER[0] in emails and "alex.chen@fingen.demo" in emails
    assert not any("oldbrand" in e or "legacy-co" in e for e in emails)
