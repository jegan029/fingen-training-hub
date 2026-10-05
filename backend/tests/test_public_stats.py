"""The sign in page's public endpoint and the Retry-After header on 429."""

import json
from pathlib import Path

import pytest

from app.db import connection
from app.main import app
from app.routers import public

DATASET = Path(__file__).resolve().parents[1] / "app" / "data" / "demo_dataset.json"


@pytest.fixture(autouse=True)
def _fresh_cache():
    public.reset_cache()
    yield
    public.reset_cache()


def test_stats_are_public_and_only_three_counts(client):
    client.cookies.clear()
    res = client.get("/api/public/stats")
    assert res.status_code == 200
    data = res.json()
    assert set(data) == {"paths", "lessons", "runbooks"}
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    assert data["paths"] == len(dataset["paths"])
    assert data["lessons"] == sum(len(p["nodes"]) for p in dataset["paths"])
    assert data["runbooks"] == len(dataset["runbooks"])
    assert res.headers["Cache-Control"] == "public, max-age=600"


def test_stats_leave_out_servicenow_runbooks(client):
    app.state.servicenow_sync.run("full")
    with connection() as conn:
        synced = conn.execute("SELECT COUNT(*) FROM runbooks WHERE source = 'servicenow'").fetchone()[0]
        local = conn.execute("SELECT COUNT(*) FROM runbooks WHERE source = 'local'").fetchone()[0]
    assert synced > 0
    assert client.get("/api/public/stats").json()["runbooks"] == local


def test_stats_are_rate_limited(client):
    codes = [client.get("/api/public/stats").status_code for _ in range(31)]
    assert codes[:30] == [200] * 30
    assert codes[30] == 429


def test_login_429_says_when_to_retry(client):
    for i in range(5):
        client.post("/api/auth/login", json={"email": f"x{i}@example.com", "password": "bad"})
    res = client.post("/api/auth/login", json={"email": "x@example.com", "password": "bad"})
    assert res.status_code == 429
    assert 1 <= int(res.headers["Retry-After"]) <= 60
