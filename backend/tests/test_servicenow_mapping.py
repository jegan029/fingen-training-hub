import copy

import pytest
import yaml
from pydantic import ValidationError

from app.integrations.servicenow.mapping import MappingError, load_mapping, parse_mapping
from app.integrations.servicenow.settings import DEFAULT_MAPPING_PATH, load_settings


@pytest.fixture()
def raw():
    return yaml.safe_load(DEFAULT_MAPPING_PATH.read_text(encoding="utf-8"))


def test_shipped_mapping_is_valid():
    mapping = load_mapping(DEFAULT_MAPPING_PATH)
    assert mapping.source_table == "kb_knowledge"
    assert mapping.applications.mode == "cmdb_ci"
    # Only the latest published version of each article.
    assert "workflow_state=published" in mapping.encoded_query and "latest=true" in mapping.encoded_query
    assert mapping.types.match_on == ["category"]


def test_sysparm_fields_are_only_mapped_fields(raw):
    mapping = parse_mapping(raw)
    fields = mapping.sysparm_fields().split(",")
    assert fields[:4] == ["sys_id", "number", "short_description", "text"]
    assert "u_classification" in fields and "cmdb_ci" in fields
    assert len(fields) == len(set(fields))
    # The article_fields block is configured but not selected, so its fields are not requested.
    assert "u_application_number" not in fields


@pytest.mark.parametrize("source", ["category", "knowledge_base"])
def test_classification_from_category_or_knowledge_base_needs_no_extra_field(raw, source):
    raw["classification"] = {"source": source, "values": {"Restricted Ops": "restricted", "IT": "internal"}}
    mapping = parse_mapping(raw)
    assert "u_classification" not in mapping.sysparm_fields()
    assert mapping.classification.level_for("it") == "internal"


def test_display_value_follows_field_reads(raw):
    assert parse_mapping(raw).sysparm_display_value() == "all"
    for spec in raw["fields"].values():
        spec.pop("read", None)
    raw["classification"]["field"].pop("read")
    raw["applications"]["cmdb_ci"]["field"].pop("read")
    assert parse_mapping(raw).sysparm_display_value() == "false"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda m: m.update(unexpected=True),
        lambda m: m["fields"].update(extra_field={"name": "x"}),
        lambda m: m["fields"].pop("number"),
        lambda m: m["classification"].update(values={"Public": "top-secret"}),
        lambda m: m["classification"].pop("field"),
        lambda m: m["applications"].update(mode="graph"),
        lambda m: m["applications"].update(mode="m2m", m2m=None),
        lambda m: m["documents"].update(allowed_types=["exe"]),
        lambda m: m["fields"]["title"].update(name="short_description; DROP"),
        lambda m: m.update(encoded_query="active=true^ORDERBYnumber"),
        lambda m: m["node_links"]["by_keyword"].update(bad=[0]),
    ],
    ids=[
        "unknown top level key",
        "unknown field concept",
        "missing required field",
        "bad level",
        "field source without field",
        "bad application mode",
        "selected application block missing",
        "document type outside allowlist",
        "unsafe field name",
        "ordering in encoded query",
        "non positive node id",
    ],
)
def test_invalid_mapping_rejected(raw, mutate):
    bad = copy.deepcopy(raw)
    mutate(bad)
    with pytest.raises(MappingError, match="Invalid ServiceNow mapping"):
        parse_mapping(bad)


def test_classification_values_normalised_and_fail_closed(raw):
    cls = parse_mapping(raw).classification
    assert cls.level_for("Public") == "public"
    assert cls.level_for("  internal   use only ") == "internal"
    assert cls.level_for("CONFIDENTIAL") == "confidential"
    assert cls.level_for("Secret Squirrel") == "restricted"
    assert cls.level_for("") == "restricted"
    assert cls.level_for(None) == "restricted"


def test_article_kind_from_types(raw):
    types = parse_mapping(raw).types
    assert types.kind_for("html", "runbook") == "runbook"
    assert types.kind_for("html", "Standard Operating Procedure") == "sop"
    assert types.kind_for("html", "General") == "other"
    # article_type is the format (html or wiki), so it is not matched by default.
    assert types.kind_for("Runbook", "General") == "other"


def test_unreadable_or_broken_yaml(tmp_path):
    with pytest.raises(MappingError, match="Cannot read"):
        load_mapping(tmp_path / "missing.yaml")
    broken = tmp_path / "broken.yaml"
    broken.write_text("version: [1\n", encoding="utf-8")
    with pytest.raises(MappingError, match="not valid YAML"):
        load_mapping(broken)


def test_settings_hide_secrets(monkeypatch):
    monkeypatch.setenv("SERVICENOW_CLIENT_SECRET", "s3cr3t-client-value")  # gitleaks:allow (test-only value)
    monkeypatch.setenv("SERVICENOW_PASSWORD", "s3cr3t-password-value")  # gitleaks:allow (test-only value)
    settings = load_settings()
    assert "s3cr3t" not in repr(settings) and "s3cr3t" not in str(settings.model_dump())
    assert settings.secrets() == ["s3cr3t-client-value", "s3cr3t-password-value"]


def test_settings_defaults_in_development(monkeypatch):
    for name in ("SERVICENOW_ENABLED", "SERVICENOW_MOCK_MODE", "SERVICENOW_ALLOWED_HOSTS"):
        monkeypatch.delenv(name, raising=False)
    settings = load_settings()
    assert settings.enabled and settings.mock_mode  # conftest runs with APP_ENV=development
    assert settings.allowed_hosts == ("*.service-now.com",)
    assert settings.llm_max_classification == "internal"


@pytest.mark.parametrize(
    "name,value",
    [
        ("SERVICENOW_ENABLED", "maybe"),
        ("SERVICENOW_AUTH_MODE", "kerberos"),
        ("SERVICENOW_SYNC_INTERVAL_MINUTES", "1"),
        ("SERVICENOW_LLM_MAX_CLASSIFICATION", "secret"),
    ],
)
def test_invalid_settings_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises((ValueError, ValidationError)):
        load_settings()


def test_app_refuses_to_start_with_invalid_mapping(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from app.main import app

    broken = tmp_path / "mapping.yaml"
    broken.write_text("version: 1\n", encoding="utf-8")
    monkeypatch.setenv("SERVICENOW_ENABLED", "true")
    monkeypatch.setenv("SERVICENOW_MAPPING_PATH", str(broken))
    with pytest.raises(MappingError), TestClient(app):
        pass
