#!/usr/bin/env python3
"""Check the ServiceNow mapping against a live instance (or the mock fixtures).

Connects with the configured credentials (backend/.env or environment variables), fetches a few
articles and reports, per mapped field, whether it was found, missing or empty. It also checks the
application lookup and the attachment listing for the first article.

It never prints credentials, tokens, article bodies or titles: bodies appear only as a length and
a short hash, so the output is safe to paste into a ticket.

Usage (from the repo root, with the backend virtualenv):
  backend/.venv/Scripts/python scripts/servicenow_probe.py [--limit 3]
Exit code 0 when every required field was found, 1 otherwise.
"""

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.integrations.servicenow.config import load_config  # noqa: E402
from app.integrations.servicenow.errors import ServiceNowError  # noqa: E402
from app.integrations.servicenow.factory import build_client  # noqa: E402
from app.integrations.servicenow.redaction import install_redaction  # noqa: E402

REQUIRED = ("sys_id", "number", "title", "body_html", "workflow_state", "updated_on")


def _status(record: dict, name: str) -> str:
    if name not in record:
        return "MISSING"
    value = record[name]
    parts = value if isinstance(value, dict) else {"value": value}
    return "found" if any(str(v).strip() for v in parts.values()) else "empty"


def _value(record: dict, name: str) -> str:
    value = record.get(name, "")
    return str(value.get("value", "")) if isinstance(value, dict) else str(value)


def _display(record: dict, name: str) -> str:
    value = record.get(name, "")
    return str(value.get("display_value", "")) if isinstance(value, dict) else str(value)


def probe(limit: int) -> int:
    config = load_config()
    settings, mapping = config.settings, config.mapping
    install_redaction(settings.secrets())
    if mapping is None:
        print("SERVICENOW_ENABLED is false; nothing to probe.")
        return 1
    print(f"Mode: {'mock (fixtures, no network)' if settings.mock_mode else 'live'}; auth: {settings.auth_mode}")
    print(f"Table: {mapping.source_table}; display values: {mapping.sysparm_display_value()}")

    try:
        client = build_client(config)
        articles = list(client.articles(limit=limit))
    except (ServiceNowError, ValueError) as exc:
        print(f"FAILED: {exc}")
        return 1
    if not articles:
        print("No articles matched encoded_query. Check the filter and the account's read access.")
        return 1

    concepts = {name: getattr(mapping.fields, name) for name in type(mapping.fields).model_fields}
    concepts = {k: v for k, v in concepts.items() if v is not None}
    if mapping.classification.source == "field" and mapping.classification.field:
        concepts["classification"] = mapping.classification.field
    apps = mapping.applications
    if apps.mode == "article_fields" and apps.article_fields:
        concepts["app_number"], concepts["app_name"] = apps.article_fields.number, apps.article_fields.name
    elif apps.mode == "cmdb_ci" and apps.cmdb_ci:
        concepts["application_ci"] = apps.cmdb_ci.field

    missing_required = False
    for index, record in enumerate(articles, start=1):
        print(f"\nArticle {index}: {_value(record, mapping.fields.number.name) or '(no number)'}")
        for concept, spec in concepts.items():
            state = _status(record, spec.name)
            print(f"  {concept:<16} {spec.name:<24} {state}")
            if concept in REQUIRED and state != "found":
                missing_required = True
        body = _value(record, mapping.fields.body_html.name)
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]
        print(f"  body: {len(body)} characters, sha256 {digest}")
        cls = mapping.classification
        raw = {
            "field": _display(record, cls.field.name) if cls.field else "",
            "category": _display(record, mapping.fields.category.name),
            "knowledge_base": _display(record, mapping.fields.knowledge_base.name),
        }
        source = raw[cls.source]
        print(f"  classification: source value {'set' if source else 'empty'} -> {cls.level_for(source)}")
        kind = mapping.types.kind_for(_display(record, mapping.fields.article_type.name), raw["category"])
        print(f"  type: {kind}")

    first = articles[0]
    try:
        if apps.mode == "cmdb_ci" and apps.cmdb_ci:
            ci = _value(first, apps.cmdb_ci.field.name)
            if ci:
                rows = client.records_by_sys_id(
                    apps.cmdb_ci.ci_table, [ci], [apps.cmdb_ci.number_field, apps.cmdb_ci.name_field]
                )
                found = bool(rows) and all(
                    _status(rows[0], f) == "found" for f in (apps.cmdb_ci.number_field, apps.cmdb_ci.name_field)
                )
                print(f"\nApplication lookup in {apps.cmdb_ci.ci_table}: {'found' if found else 'NOT FOUND'}")
            else:
                print("\nApplication lookup: first article has no CI")
        attachments = client.attachments(_value(first, mapping.fields.sys_id.name))
        print(f"Attachments on the first article: {len(attachments)}")
    except (ServiceNowError, ValueError) as exc:
        print(f"Follow up lookups FAILED: {exc}")
        return 1
    finally:
        client.close()

    if missing_required:
        print("\nRequired fields are missing or empty: adjust mapping.yaml.")
        return 1
    print("\nAll required fields found.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limit", type=int, default=3, choices=range(1, 11), metavar="1..10")
    return probe(parser.parse_args().limit)


if __name__ == "__main__":
    sys.exit(main())
