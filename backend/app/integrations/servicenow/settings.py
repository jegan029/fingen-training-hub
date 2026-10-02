"""ServiceNow settings, read from environment variables only (backend/.env is loaded by app.config).

Secrets are SecretStr, so they never show up in repr(), logs or tracebacks.
"""

import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr

from ...config import IS_DEV
from ...services.classification import Level

DEFAULT_MAPPING_PATH = Path(__file__).resolve().parent / "mapping.yaml"
DEFAULT_ALLOWED_HOSTS = ("*.service-now.com",)


class ServiceNowSettings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: bool
    mock_mode: bool
    instance_url: str = ""
    auth_mode: Literal["oauth", "basic"] = "oauth"
    client_id: str = ""
    client_secret: SecretStr = SecretStr("")
    username: str = ""
    password: SecretStr = SecretStr("")
    sync_interval_minutes: int = Field(default=60, ge=5, le=1440)
    full_sync_hour: int = Field(default=2, ge=0, le=23)
    allowed_hosts: tuple[str, ...] = DEFAULT_ALLOWED_HOSTS
    max_document_mb: int = Field(default=25, ge=1, le=100)
    stale_hours: int = Field(default=24, ge=1)
    llm_max_classification: Level = "internal"
    mapping_path: Path = DEFAULT_MAPPING_PATH

    def secrets(self) -> list[str]:
        """Configured secret values, for the log redaction filter."""
        return [s for s in (self.client_secret.get_secret_value(), self.password.get_secret_value()) if s]


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    value = raw.strip().lower()
    if value in ("true", "1", "yes", "on"):
        return True
    if value in ("false", "0", "no", "off"):
        return False
    raise ValueError(f"{name} must be true or false")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def load_settings() -> ServiceNowSettings:
    """Build settings from the environment. Mock mode (and the integration) default on in development only."""
    hosts = tuple(h.strip().lower() for h in _env("SERVICENOW_ALLOWED_HOSTS").split(",") if h.strip())
    return ServiceNowSettings(
        enabled=_bool("SERVICENOW_ENABLED", IS_DEV),
        mock_mode=_bool("SERVICENOW_MOCK_MODE", IS_DEV),
        instance_url=_env("SERVICENOW_INSTANCE_URL").rstrip("/"),
        auth_mode=_env("SERVICENOW_AUTH_MODE", "oauth").lower() or "oauth",
        client_id=_env("SERVICENOW_CLIENT_ID"),
        client_secret=SecretStr(os.getenv("SERVICENOW_CLIENT_SECRET", "")),
        username=_env("SERVICENOW_USERNAME"),
        password=SecretStr(os.getenv("SERVICENOW_PASSWORD", "")),
        sync_interval_minutes=_env("SERVICENOW_SYNC_INTERVAL_MINUTES") or 60,
        full_sync_hour=_env("SERVICENOW_FULL_SYNC_HOUR") or 2,
        allowed_hosts=hosts or DEFAULT_ALLOWED_HOSTS,
        max_document_mb=_env("SERVICENOW_MAX_DOC_MB") or 25,
        stale_hours=_env("SERVICENOW_STALE_HOURS") or 24,
        llm_max_classification=_env("SERVICENOW_LLM_MAX_CLASSIFICATION", "internal").lower() or "internal",
        mapping_path=Path(_env("SERVICENOW_MAPPING_PATH") or DEFAULT_MAPPING_PATH),
    )
