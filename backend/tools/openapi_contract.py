from __future__ import annotations

import argparse
import difflib
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = REPO_ROOT / "shared" / "openapi.taskbridge.v1.json"
VERSION_PATH = REPO_ROOT / "VERSION"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate or verify the committed OpenAPI contract.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="verify the committed contract")
    mode.add_argument("--write", action="store_true", help="refresh the committed contract")
    args = parser.parse_args(argv)

    schema = build_contract_schema()
    rendered_schema = render_schema(schema)

    if args.write:
        CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONTRACT_PATH.write_text(rendered_schema, encoding="utf-8")
        print(f"wrote {CONTRACT_PATH.relative_to(REPO_ROOT)}")
        return 0

    return check_contract(schema, rendered_schema)


def build_contract_schema() -> dict[str, Any]:
    return normalize_contract_schema(create_app().openapi())


def normalize_contract_schema(schema: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(schema)
    normalized.setdefault("info", {})["version"] = VERSION_PATH.read_text(
        encoding="utf-8",
    ).strip()
    validation_properties = (
        normalized.get("components", {})
        .get("schemas", {})
        .get("ValidationError", {})
        .get("properties", {})
    )
    if isinstance(validation_properties, dict):
        validation_properties.pop("ctx", None)
        validation_properties.pop("input", None)
    return normalized


def check_contract(schema: dict[str, Any], rendered_schema: str) -> int:
    if not CONTRACT_PATH.exists():
        print(
            "OpenAPI contract snapshot is missing. Run "
            "`python -m tools.openapi_contract --write` from backend/.",
            file=sys.stderr,
        )
        return 1

    committed_schema = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if committed_schema == schema:
        print("OpenAPI contract check passed")
        return 0

    committed_rendered = render_schema(committed_schema)
    diff = difflib.unified_diff(
        committed_rendered.splitlines(),
        rendered_schema.splitlines(),
        fromfile=str(CONTRACT_PATH.relative_to(REPO_ROOT)),
        tofile="runtime FastAPI OpenAPI",
        lineterm="",
    )
    print(
        "OpenAPI contract drift detected. Run "
        "`python -m tools.openapi_contract --write` from backend/.",
        file=sys.stderr,
    )
    for line in list(diff)[:80]:
        print(line, file=sys.stderr)
    return 1


def render_schema(schema: dict[str, Any]) -> str:
    return json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
