from dataclasses import dataclass

from .mapping import Mapping, load_mapping
from .settings import ServiceNowSettings, load_settings


@dataclass(frozen=True)
class ServiceNowConfig:
    settings: ServiceNowSettings
    mapping: Mapping | None  # None when the integration is disabled


def load_config() -> ServiceNowConfig:
    """Read settings and, when the integration is enabled, validate the mapping (raises MappingError)."""
    settings = load_settings()
    mapping = load_mapping(settings.mapping_path) if settings.enabled else None
    return ServiceNowConfig(settings=settings, mapping=mapping)
