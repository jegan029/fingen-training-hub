"""Field mapping between a ServiceNow instance and the Training Hub, loaded from mapping.yaml.

Instances differ (custom fields, CI relationships, classification values), so nothing about the
source schema is hardcoded: every field name comes from the mapping, which is validated at startup.

Display values: the Table API applies sysparm_display_value to the whole request, not per field.
Each field says which part it needs (`read: value | display | both`); if any field needs a display
value the client asks for `all`, and each field is read from the matching part of the response.
"""

from functools import cached_property
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from ...services.classification import FAIL_CLOSED, Level

Read = Literal["value", "display", "both"]
ArticleKind = Literal["runbook", "sop", "other"]
DocumentType = Literal["pdf", "docx", "xlsx", "pptx", "txt", "png", "jpg"]

_NAME = r"^[A-Za-z_][A-Za-z0-9_.]*$"


class MappingError(RuntimeError):
    """The mapping file is missing or invalid."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FieldSpec(_Strict):
    name: str = Field(pattern=_NAME)
    read: Read = "value"


class ArticleFields(_Strict):
    sys_id: FieldSpec
    number: FieldSpec
    title: FieldSpec
    body_html: FieldSpec
    summary: FieldSpec | None = None
    knowledge_base: FieldSpec
    category: FieldSpec
    article_type: FieldSpec
    workflow_state: FieldSpec
    version: FieldSpec
    valid_to: FieldSpec
    updated_on: FieldSpec


class ClassificationMap(_Strict):
    # field: a (custom) field on the article; category / knowledge_base: the display name of either.
    source: Literal["field", "category", "knowledge_base"]
    field: FieldSpec | None = None
    values: dict[str, Level] = Field(min_length=1)

    @model_validator(mode="after")
    def _field_when_needed(self) -> "ClassificationMap":
        if self.source == "field" and self.field is None:
            raise ValueError("classification.field is required when source is field")
        return self

    @cached_property
    def _normalised(self) -> dict[str, Level]:
        return {" ".join(k.split()).casefold(): v for k, v in self.values.items()}

    def level_for(self, raw: str | None) -> Level:
        """Internal level for a source value; missing or unmapped values fail closed."""
        if not raw:
            return FAIL_CLOSED
        return self._normalised.get(" ".join(raw.split()).casefold(), FAIL_CLOSED)


class ArticleAppFields(_Strict):
    number: FieldSpec
    name: FieldSpec


class CmdbCiSource(_Strict):
    field: FieldSpec
    ci_table: str = Field(pattern=_NAME)
    number_field: str = Field(pattern=_NAME)
    name_field: str = Field(pattern=_NAME)
    description_field: str | None = Field(default=None, pattern=_NAME)


class M2MSource(_Strict):
    table: str = Field(pattern=_NAME)
    article_field: str = Field(pattern=_NAME)
    ci_field: str = Field(pattern=_NAME)
    ci_table: str = Field(pattern=_NAME)
    number_field: str = Field(pattern=_NAME)
    name_field: str = Field(pattern=_NAME)
    description_field: str | None = Field(default=None, pattern=_NAME)


class ApplicationsMap(_Strict):
    mode: Literal["article_fields", "cmdb_ci", "m2m"]
    article_fields: ArticleAppFields | None = None
    cmdb_ci: CmdbCiSource | None = None
    m2m: M2MSource | None = None

    @model_validator(mode="after")
    def _selected_block_present(self) -> "ApplicationsMap":
        if getattr(self, self.mode) is None:
            raise ValueError(f"applications.{self.mode} is required when mode is {self.mode}")
        return self


class TypesMap(_Strict):
    match_on: list[Literal["article_type", "category"]] = Field(min_length=1)
    runbook: list[str] = []
    sop: list[str] = []

    def kind_for(self, article_type: str | None, category: str | None) -> ArticleKind:
        values = {"article_type": article_type, "category": category}
        candidates = {(values[key] or "").strip().casefold() for key in self.match_on} - {""}
        for kind in ("runbook", "sop"):
            if candidates & {v.strip().casefold() for v in getattr(self, kind)}:
                return kind
        return "other"


class DocumentsMap(_Strict):
    include_attachments: bool = True
    include_linked_articles: bool = True
    allowed_types: list[DocumentType] = Field(min_length=1)


class NodeLinks(_Strict):
    by_application: dict[str, list[int]] = {}
    by_keyword: dict[str, list[int]] = {}

    @field_validator("by_application", "by_keyword")
    @classmethod
    def _positive_ids(cls, links: dict[str, list[int]]) -> dict[str, list[int]]:
        if any(node_id < 1 for ids in links.values() for node_id in ids):
            raise ValueError("node ids must be positive")
        return links


class Mapping(_Strict):
    version: Literal[1]
    source_table: str = Field(pattern=_NAME)
    encoded_query: str = Field(min_length=1)
    published_states: list[str] = Field(min_length=1)
    fields: ArticleFields
    classification: ClassificationMap
    applications: ApplicationsMap
    types: TypesMap
    documents: DocumentsMap
    node_links: NodeLinks = NodeLinks()

    @field_validator("encoded_query")
    @classmethod
    def _no_ordering(cls, query: str) -> str:
        # The client adds the watermark filter and ordering itself.
        if "ORDERBY" in query.upper():
            raise ValueError("encoded_query must not contain ORDERBY; the sync adds ordering")
        return query

    def article_field_specs(self) -> list[FieldSpec]:
        specs = [spec for name in ArticleFields.model_fields if (spec := getattr(self.fields, name)) is not None]
        if self.classification.source == "field" and self.classification.field:
            specs.append(self.classification.field)
        if self.applications.mode == "article_fields" and self.applications.article_fields:
            specs += [self.applications.article_fields.number, self.applications.article_fields.name]
        if self.applications.mode == "cmdb_ci" and self.applications.cmdb_ci:
            specs.append(self.applications.cmdb_ci.field)
        return specs

    def sysparm_fields(self) -> str:
        """Only the mapped fields, in a stable order, without duplicates."""
        return ",".join(dict.fromkeys(spec.name for spec in self.article_field_specs()))

    def sysparm_display_value(self) -> Literal["true", "false", "all"]:
        reads = {spec.read for spec in self.article_field_specs()}
        if reads == {"display"}:
            return "true"
        return "all" if reads - {"value"} else "false"


def parse_mapping(data: Any) -> Mapping:
    try:
        return Mapping.model_validate(data)
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(str(p) for p in e['loc']) or 'mapping'}: {e['msg']}" for e in exc.errors())
        raise MappingError(f"Invalid ServiceNow mapping: {problems}") from None


def load_mapping(path: Path) -> Mapping:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise MappingError(f"Cannot read ServiceNow mapping at {path.name}: {exc.strerror}") from None
    except yaml.YAMLError as exc:
        raise MappingError(f"ServiceNow mapping {path.name} is not valid YAML: {exc}") from None
    return parse_mapping(data)
