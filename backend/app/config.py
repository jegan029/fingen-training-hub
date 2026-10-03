import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATASET_PATH = DATA_DIR / "demo_dataset.json"

# Load backend/.env (real environment variables take precedence).
load_dotenv(BASE_DIR.parent / ".env")

logger = logging.getLogger("fingen")

APP_ENV = os.getenv("APP_ENV", "production").strip().lower()
IS_DEV = APP_ENV == "development"

DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "app.db")))
# Synced ServiceNow documents, named by sha256. Next to the database (so in the same Docker volume),
# never under a static or public folder; files are only served through an access checked endpoint.
KB_DOCUMENTS_DIR = Path(os.getenv("KB_DOCUMENTS_DIR", str(DB_PATH.parent / "kb_documents")))

# openai_compatible (OpenAI, NVIDIA, vLLM, Ollama...), anthropic, or offline (no network, deterministic).
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai_compatible").strip().lower()
_DEFAULT_LLM_BASE_URLS = {"openai_compatible": "https://api.openai.com/v1", "anthropic": "https://api.anthropic.com/v1"}
LLM_BASE_URL = os.getenv("LLM_BASE_URL") or _DEFAULT_LLM_BASE_URLS.get(LLM_PROVIDER, "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "15"))
LLM_RETRIES = int(os.getenv("LLM_RETRIES", "3"))


def _load_secret_key() -> str:
    key = os.getenv("APP_SECRET_KEY", "")
    if len(key.encode()) >= 32:
        return key
    if IS_DEV:
        logger.warning(
            "APP_SECRET_KEY missing or shorter than 32 bytes; using a random per-process key (development only)."
        )
        return secrets.token_urlsafe(48)
    raise RuntimeError("APP_SECRET_KEY must be set to at least 32 bytes (or set APP_ENV=development).")


APP_SECRET_KEY = _load_secret_key()
JWT_ALGORITHM = "HS256"
JWT_TTL_MINUTES = int(os.getenv("JWT_TTL_MINUTES", "480"))
SESSION_COOKIE = "fingen_session"
# Browsers accept Secure cookies on http://localhost; allow opting out in development for other hosts.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false" if IS_DEV else "true").lower() == "true"

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

SEED_ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "")
SEED_LEARNER_PASSWORD = os.getenv("SEED_LEARNER_PASSWORD", "")

# Rate limits (slowapi syntax).
LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5/minute")
LLM_RATE_LIMIT = os.getenv("LLM_RATE_LIMIT", "20/minute")
LOGIN_LOCKOUT_THRESHOLD = int(os.getenv("LOGIN_LOCKOUT_THRESHOLD", "10"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))

# Certificate: every node done and a best-score assessment average (0 to 10) at or above this.
CERT_MIN_AVG_SCORE = float(os.getenv("CERT_MIN_AVG_SCORE", "7"))
