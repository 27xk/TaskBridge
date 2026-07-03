import re

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import auth_headers


def test_response_includes_request_id_and_security_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "client-trace-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "client-trace-123"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"


def test_response_generates_request_id_when_missing(client: TestClient) -> None:
    response = client.get("/health")

    request_id = response.headers["X-Request-ID"]
    assert len(request_id) == 36
    assert request_id.count("-") == 4


def test_ready_endpoint_checks_database_and_redis(client: TestClient, monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "redis_health_status", lambda: "ok")
    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "status": "ready",
        "database": "ok",
        "redis": "ok",
        "service": "TaskBridge API",
    }


def test_ready_endpoint_reports_degraded_redis(client: TestClient, monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "redis_health_status", lambda: "degraded")
    response = client.get("/ready")

    assert response.status_code == 503
    assert response.json()["data"] == {
        "status": "degraded",
        "database": "ok",
        "redis": "degraded",
        "service": "TaskBridge API",
    }


def test_status_endpoint_reports_degraded_dependencies_without_failing_readiness(
    client: TestClient,
    monkeypatch,
) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "redis_health_status", lambda: "degraded")
    response = client.get("/status")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "status": "degraded",
        "database": "ok",
        "redis": "degraded",
        "service": "TaskBridge API",
    }


def test_error_responses_still_include_request_id(client: TestClient) -> None:
    response = client.post("/api/v1/auth/register", json={})

    assert response.status_code == 422
    assert response.headers["X-Request-ID"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_metrics_endpoint_exposes_http_counters(client: TestClient) -> None:
    client.get("/health")
    client.post("/api/v1/auth/register", json={})

    response = client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    body = response.text
    assert "# HELP taskbridge_http_requests_total" in body
    assert "taskbridge_http_requests_total " in body
    assert "taskbridge_http_error_responses_total " in body
    assert "taskbridge_http_request_duration_ms_sum " in body


def test_metrics_endpoint_exposes_labeled_http_series(client: TestClient) -> None:
    client.get("/health")
    client.post("/api/v1/auth/register", json={})

    response = client.get("/metrics")

    assert response.status_code == 200
    body = response.text
    assert 'taskbridge_http_requests_total{method="GET",path="/health",status="200"}' in body
    assert (
        'taskbridge_http_error_responses_total{method="POST",'
        'path="/api/v1/auth/register",status="422"}'
    ) in body
    assert (
        'taskbridge_http_request_duration_ms_sum{method="GET",'
        'path="/health",status="200"}'
    ) in body


def test_metrics_endpoint_exposes_request_duration_histogram(client: TestClient) -> None:
    client.get("/health")

    response = client.get("/metrics")

    assert response.status_code == 200
    body = response.text
    assert "# TYPE taskbridge_http_request_duration_ms histogram" in body
    assert (
        'taskbridge_http_request_duration_ms_bucket{method="GET",'
        'path="/health",status="200",le="50"}'
    ) in body
    assert (
        'taskbridge_http_request_duration_ms_bucket{method="GET",'
        'path="/health",status="200",le="+Inf"}'
    ) in body
    assert (
        'taskbridge_http_request_duration_ms_count{method="GET",'
        'path="/health",status="200"}'
    ) in body


def test_metrics_endpoint_counts_task_version_conflicts(client: TestClient) -> None:
    before = _metric_value(client.get("/metrics").text, "taskbridge_task_version_conflicts_total")
    headers = auth_headers(client, "metric-conflict", "metric-conflict@example.com")
    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Metric conflict task"},
    )
    task = create_response.json()["data"]
    update_response = client.put(
        f"/api/v1/tasks/{task['id']}",
        headers=headers,
        json={"title": "Fresh metric edit", "expected_version": task["version"]},
    )
    assert update_response.status_code == 200

    stale_response = client.put(
        f"/api/v1/tasks/{task['id']}",
        headers=headers,
        json={"title": "Stale metric edit", "expected_version": task["version"]},
    )

    assert stale_response.status_code == 409
    after = _metric_value(client.get("/metrics").text, "taskbridge_task_version_conflicts_total")
    assert after == before + 1


def test_metrics_groups_unmatched_routes_to_low_cardinality_path(client: TestClient) -> None:
    client.get("/missing-observability-a")
    client.get("/missing-observability-b")

    response = client.get("/metrics")

    assert response.status_code == 200
    body = response.text
    assert 'path="__unmatched__"' in body
    assert "missing-observability-a" not in body
    assert "missing-observability-b" not in body


def test_metrics_groups_unknown_http_methods_to_other(client: TestClient) -> None:
    client.request("FOOA", "/health")
    client.request("FOOB", "/health")

    response = client.get("/metrics")

    assert response.status_code == 200
    body = response.text
    assert 'method="OTHER"' in body
    assert 'method="FOOA"' not in body
    assert 'method="FOOB"' not in body


def test_metrics_endpoint_requires_bearer_token_when_configured(monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module.settings, "metrics_token", "metrics-secret")
    client = TestClient(create_app())

    missing_token = client.get("/metrics")
    wrong_token = client.get("/metrics", headers={"Authorization": "Bearer wrong"})
    valid_token = client.get("/metrics", headers={"Authorization": "Bearer metrics-secret"})

    assert missing_token.status_code == 401
    assert wrong_token.status_code == 401
    assert valid_token.status_code == 200


def test_production_metrics_requires_token() -> None:
    settings = Settings(
        environment="production",
        jwt_secret="x" * 32,
        database_url="mysql+pymysql://taskbridge:secure-password@127.0.0.1:3306/taskbridge",
        metrics_enabled=True,
        metrics_token="",
    )

    try:
        settings.validate_runtime_security()
    except ValueError as exc:
        assert "METRICS_TOKEN" in str(exc)
    else:
        raise AssertionError("production metrics must require METRICS_TOKEN")


def _metric_value(body: str, name: str) -> int:
    match = re.search(rf"^{re.escape(name)} (\d+)$", body, re.MULTILINE)
    assert match is not None, f"{name} metric must be present"
    return int(match.group(1))
