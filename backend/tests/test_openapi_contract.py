import json
from pathlib import Path

from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]
OPENAPI_CONTRACT_PATH = REPO_ROOT / "shared" / "openapi.taskbridge.v1.json"


def test_openapi_contract_snapshot_matches_runtime_schema():
    assert OPENAPI_CONTRACT_PATH.exists(), (
        "shared/openapi.taskbridge.v1.json is missing; run "
        "`python -m tools.openapi_contract --write` from backend/ to refresh it"
    )

    committed_schema = json.loads(OPENAPI_CONTRACT_PATH.read_text(encoding="utf-8"))
    runtime_schema = create_app().openapi()

    assert committed_schema == runtime_schema


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
