import os
import tempfile
from pathlib import Path

# Configure the app before it is imported: config is read at import time.
_TMP = Path(tempfile.mkdtemp(prefix="fingen-tests-"))
os.environ.update(
    {
        "APP_ENV": "development",
        "APP_SECRET_KEY": "test-secret-key-that-is-at-least-32-bytes-long",  # gitleaks:allow (test-only value)
        "DB_PATH": str(_TMP / "test.db"),
        "SEED_ADMIN_PASSWORD": "admin-test-password",
        "SEED_LEARNER_PASSWORD": "learner-test-password",
        "LOGIN_LOCKOUT_THRESHOLD": "3",
        "LLM_API_KEY": "",
        "LLM_MODEL": "",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import DB_PATH  # noqa: E402
from app.main import app  # noqa: E402
from app.security import CSRF_HEADER, CSRF_VALUE, limiter  # noqa: E402

ADMIN = ("admin@fingen.demo", "admin-test-password")
LEARNER = ("learner@fingen.demo", "learner-test-password")


@pytest.fixture()
def client():
    if DB_PATH.exists():
        DB_PATH.unlink()
    limiter.reset()
    with TestClient(app) as c:  # runs the lifespan handler, which seeds a fresh DB
        c.headers[CSRF_HEADER] = CSRF_VALUE
        yield c


def login(client: TestClient, creds) -> None:
    res = client.post("/api/auth/login", json={"email": creds[0], "password": creds[1]})
    assert res.status_code == 200, res.text


@pytest.fixture()
def learner_client(client):
    login(client, LEARNER)
    return client


@pytest.fixture()
def admin_client(client):
    login(client, ADMIN)
    return client
