from .client import ServiceNowClient
from .config import ServiceNowConfig
from .errors import ServiceNowConfigError
from .mock import MockServiceNowClient


def build_client(config: ServiceNowConfig) -> ServiceNowClient | MockServiceNowClient:
    """The fixture backed mock in mock mode, otherwise the real client (validates URL and credentials)."""
    if not config.settings.enabled or config.mapping is None:
        raise ServiceNowConfigError("The ServiceNow integration is disabled")
    if config.settings.mock_mode:
        return MockServiceNowClient(config.mapping)
    return ServiceNowClient(config.settings, config.mapping)
