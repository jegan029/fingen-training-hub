"""SSRF guard: the integration only ever talks to an allowlisted HTTPS ServiceNow host."""

import ipaddress
import re
from fnmatch import fnmatchcase
from urllib.parse import urlsplit

import httpx

from .errors import ServiceNowConfigError

_HOSTNAME = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
SYS_ID = re.compile(r"^[0-9a-f]{32}$")


def validate_instance_url(url: str, allowed_hosts: tuple[str, ...]) -> str:
    """Return the normalised base URL (https://host) or raise ServiceNowConfigError.

    Rejects anything but https, credentials in the URL, explicit ports, paths, queries, IP literals
    and hosts that do not match an allowlist pattern (default *.service-now.com).
    """
    if not url:
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL is not set")
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError:
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL is not a valid URL") from None
    if parts.scheme != "https":
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL must use https")
    if parts.username or parts.password:
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL must not contain credentials")
    if port is not None:
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL must not set a port")
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL must be the bare instance address")
    host = (parts.hostname or "").lower()
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL must be a host name, not an IP address")
    if not _HOSTNAME.match(host):
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL has an invalid host name")
    if not any(fnmatchcase(host, pattern.lower()) for pattern in allowed_hosts):
        raise ServiceNowConfigError("SERVICENOW_INSTANCE_URL is not in SERVICENOW_ALLOWED_HOSTS")
    return f"https://{host}"


def ensure_same_origin(url: httpx.URL, base: str) -> None:
    """Every outgoing request must stay on the validated instance."""
    if f"{url.scheme}://{url.host}" != base or url.port not in (None, 443):
        raise ServiceNowConfigError("Refusing a request outside the ServiceNow instance")


def check_sys_id(value: str) -> str:
    if not SYS_ID.match(value or ""):
        raise ValueError("invalid sys_id")
    return value
