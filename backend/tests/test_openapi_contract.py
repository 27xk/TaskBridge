import json
from pathlib import Path

from app.main import create_app
from tools.openapi_contract import build_contract_schema, normalize_contract_schema

REPO_ROOT = Path(__file__).resolve().parents[2]
OPENAPI_CONTRACT_PATH = REPO_ROOT / "shared" / "openapi.taskbridge.v1.json"


def test_openapi_contract_snapshot_matches_runtime_schema():
    assert OPENAPI_CONTRACT_PATH.exists(), (
        "shared/openapi.taskbridge.v1.json is missing; run "
        "`python -m tools.openapi_contract --write` from backend/ to refresh it"
    )

    committed_schema = json.loads(OPENAPI_CONTRACT_PATH.read_text(encoding="utf-8"))
    runtime_schema = build_contract_schema()

    assert committed_schema == runtime_schema


def test_openapi_contract_uses_repository_version():
    expected_version = (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip()

    assert build_contract_schema()["info"]["version"] == expected_version


def test_openapi_contract_ignores_framework_validation_detail_drift():
    runtime_schema = {
        "info": {"version": "runtime-override"},
        "components": {
            "schemas": {
                "ValidationError": {
                    "properties": {
                        "loc": {"type": "array"},
                        "ctx": {"type": "object"},
                        "input": {"title": "Input"},
                    },
                },
            },
        },
    }

    normalized = normalize_contract_schema(runtime_schema)

    assert normalized["components"]["schemas"]["ValidationError"]["properties"] == {
        "loc": {"type": "array"},
    }
    assert runtime_schema["components"]["schemas"]["ValidationError"]["properties"]["ctx"]


def test_openapi_contract_documents_cross_client_surface():
    schema = create_app().openapi()

    required_paths = {
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/analytics/events",
        "/api/v1/analytics/summary",
        "/api/v1/devices/register",
        "/api/v1/tasks",
        "/api/v1/tasks/import",
        "/api/v1/tasks/import/preview",
        "/api/v1/tasks/{task_id}",
        "/api/v1/tasks/{task_id}/complete",
        "/api/v1/sync/pull",
        "/api/v1/sync/push",
        "/api/v1/sync/status",
        "/api/v1/observability/client-error",
    }
    assert required_paths.issubset(schema["paths"])
    assert "OAuth2PasswordBearer" in schema["components"]["securitySchemes"]


def test_all_json_success_responses_have_payload_contracts():
    schema = create_app().openapi()
    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            for status, response in operation["responses"].items():
                if not status.startswith("2"):
                    continue
                json_body = response.get("content", {}).get("application/json")
                if json_body is not None:
                    assert json_body.get("schema"), f"{method} {path} {status}: missing response schema"


def test_task_response_preserves_null_and_checklist_contract(client):
    from tests.conftest import auth_headers

    headers = auth_headers(client, "contract-payload", "contract-payload@example.com")
    response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "契约样本", "content": None, "checklist": [{"id": "one", "title": "子项", "done": False}]},
    )
    assert response.status_code == 201
    from app.schemas.responses import ApiResponse
    from app.schemas.task import TaskRead

    validated = ApiResponse[TaskRead].model_validate(response.json())
    assert validated.data.content is None
    assert validated.data.checklist[0].done is False
    assert validated.model_dump(mode="json") == response.json()


def test_task_export_response_matches_documented_payload(client):
    from app.schemas.responses import ApiResponse, TaskExportResult
    from tests.conftest import auth_headers

    headers = auth_headers(client, "export-contract", "export-contract@example.com")
    client.post("/api/v1/tasks", headers=headers, json={"title": "export"})
    response = client.get("/api/v1/tasks/export", headers=headers)
    assert response.status_code == 200
    validated = ApiResponse[TaskExportResult].model_validate(response.json())
    assert len(validated.data.tasks) == 1


def test_task_export_documents_the_csv_representation():
    operation = create_app().openapi()["paths"]["/api/v1/tasks/export"]["get"]
    content = operation["responses"]["200"]["content"]
    assert content["text/csv"]["schema"] == {"type": "string"}


def test_validation_error_schema_matches_unified_error_response(client):
    from app.schemas.responses import ApiError

    response = client.post("/api/v1/auth/login", json={})
    assert response.status_code == 422
    assert ApiError.model_validate(response.json()).data is None
    schema = create_app().openapi()["paths"]["/api/v1/auth/login"]["post"]["responses"]["422"]
    assert schema["content"]["application/json"]["schema"]["$ref"].endswith("/ApiError")
