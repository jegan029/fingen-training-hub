"""Mock ServiceNow: serves the synthetic fixtures through the same interface as ServiceNowClient.

Records are returned in the Table API's own shape (sysparm_fields, sysparm_display_value), and the
mapping's encoded query is applied, so the sync code cannot tell the difference. No network access.
"""

import copy
import json
from collections.abc import Iterator
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .client import CircuitBreaker
from .errors import DocumentTooLarge, ServiceNowError
from .mapping import Mapping
from .urls import check_sys_id

FIXTURES = Path(__file__).resolve().parent / "fixtures"
MOCK_INSTANCE_URL = "https://example.service-now.com"  # placeholder, never contacted
_TIME = "%Y-%m-%d %H:%M:%S"


def _load(name: str) -> list[dict[str, Any]]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _parts(raw: Any) -> tuple[str, str]:
    """(value, display_value) of a fixture field; plain strings are both."""
    if isinstance(raw, dict):
        return str(raw.get("value", "")), str(raw.get("display_value", ""))
    return str(raw), str(raw)


def _shape(record: dict[str, Any], fields: str, display_value: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name in fields.split(","):
        if name not in record:
            continue  # like ServiceNow, unknown fields are simply absent
        value, display = _parts(record[name])
        out[name] = (
            {"value": value, "display_value": display}
            if display_value == "all"
            else (display if display_value == "true" else value)
        )
    return out


def _matches(record: dict[str, Any], query: str) -> bool:
    """Supports the encoded query operators the integration uses: =, !=, >=, >, IN, ORDERBY."""
    for cond in filter(None, query.split("^")):
        if cond.startswith("ORDERBY"):
            continue
        for op in ("!=", ">=", ">", "IN", "="):
            field, sep, expected = cond.partition(op)
            if sep and field and field.replace("_", "").isalnum():
                break
        else:
            raise ValueError("unsupported encoded query condition in mock mode")
        actual = _parts(record.get(field, ""))[0]
        ok = {
            "!=": actual != expected,
            ">=": actual >= expected,
            ">": actual > expected,
            "IN": actual in expected.split(","),
            "=": actual == expected,
        }[op]
        if not ok:
            return False
    return True


def _order_field(query: str) -> str | None:
    orders = [c[len("ORDERBY") :] for c in query.split("^") if c.startswith("ORDERBY")]
    return orders[-1] if orders else None


class MockServiceNowClient:
    def __init__(self, mapping: Mapping) -> None:
        self.mapping = mapping
        self.base_url = MOCK_INSTANCE_URL
        self.breaker = CircuitBreaker()
        self.tables: dict[str, list[dict[str, Any]]] = {
            mapping.source_table: _load("articles.json"),
            "cmdb_ci_business_app": _load("applications.json"),
        }
        self._attachments = _load("attachments.json")

    def close(self) -> None:
        pass

    @property
    def records(self) -> list[dict[str, Any]]:
        return self.tables[self.mapping.source_table]

    # ── Test helpers ────────────────────────────────────────

    def find(self, number: str) -> dict[str, Any]:
        return next(r for r in self.records if r["number"] == number)

    def bump(self, number: str, **changes: Any) -> dict[str, Any]:
        """Change an article and move its sys_updated_on past every other record, like an edit in ServiceNow."""
        record = self.find(number)
        latest = max(datetime.strptime(_parts(r["sys_updated_on"])[0], _TIME) for r in self.records)
        record.update(copy.deepcopy(changes))
        record["sys_updated_on"] = (latest + timedelta(minutes=1)).strftime(_TIME)
        return record

    # ── Client interface ────────────────────────────────────

    def table(
        self,
        table: str,
        query: str,
        fields: str,
        display_value: str = "false",
        *,
        limit: int | None = None,
        page_size: int = 100,
    ) -> Iterator[dict[str, Any]]:
        rows = [r for r in self.tables.get(table, []) if _matches(r, query)]
        order = _order_field(query)
        if order:
            rows.sort(key=lambda r: _parts(r.get(order, ""))[0])
        for row in rows[:limit] if limit else rows:
            yield _shape(row, fields, display_value)

    def articles(self, since: str | None = None, *, limit: int | None = None) -> Iterator[dict[str, Any]]:
        m = self.mapping
        updated = m.fields.updated_on.name
        query = m.encoded_query + (f"^{updated}>={since}" if since else "") + f"^ORDERBY{updated}"
        return self.table(m.source_table, query, m.sysparm_fields(), m.sysparm_display_value(), limit=limit)

    def records_by_sys_id(self, table: str, sys_ids: list[str], fields: list[str]) -> list[dict[str, Any]]:
        ids = [check_sys_id(s) for s in dict.fromkeys(sys_ids)]
        return list(self.table(table, f"sys_idIN{','.join(ids)}", ",".join(["sys_id", *fields])))

    def attachments(self, article_sys_id: str) -> list[dict[str, Any]]:
        check_sys_id(article_sys_id)
        return [
            {k: v for k, v in a.items() if k != "file"}
            for a in self._attachments
            if a["table_name"] == self.mapping.source_table and a["table_sys_id"] == article_sys_id
        ]

    def download(self, attachment_sys_id: str, max_bytes: int) -> bytes:
        check_sys_id(attachment_sys_id)
        match = next((a for a in self._attachments if a["sys_id"] == attachment_sys_id), None)
        if match is None:
            raise ServiceNowError("ServiceNow returned HTTP 404", 404)
        data = (FIXTURES / "files" / match["file"]).read_bytes()
        if len(data) > max_bytes:
            raise DocumentTooLarge("Attachment exceeds the size limit")
        return data
