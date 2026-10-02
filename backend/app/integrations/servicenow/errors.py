class ServiceNowError(Exception):
    """A ServiceNow call failed. Messages never contain credentials, response bodies or query strings."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class ServiceNowConfigError(ServiceNowError):
    """The integration is misconfigured (instance URL, auth mode, credentials)."""


class CircuitOpenError(ServiceNowError):
    """Too many consecutive failures; calls are refused until the breaker half opens."""


class DocumentTooLarge(ServiceNowError):
    """An attachment exceeds the configured size limit."""
