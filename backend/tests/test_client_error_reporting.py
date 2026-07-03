from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_client_error_report_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/v1/observability/client-error",
        json={
            "source": "web",
            "message": "uncaught error",
        },
    )

    assert response.status_code == 401


def test_client_error_report_is_accepted_and_counted(client: TestClient) -> None:
    headers = auth_headers(client, "client-error", "client-error@example.com")
    before = client.get("/metrics").text

    response = client.post(
        "/api/v1/observability/client-error",
        headers=headers,
        json={
            "source": "web",
            "message": "uncaught TypeError",
            "url": "https://taskbridge.example.com/app",
            "user_agent": "test-agent",
            "stack": "TypeError: broken\n    at test",
            "app_version": "0.1.6",
            "route": "/tasks",
            "trace_id": "web-client-trace-1",
            "visibility_state": "visible",
            "online": True,
        },
    )

    assert response.status_code == 202
    data = response.json()["data"]
    assert data["accepted"] is True
    assert len(data["report_id"]) == 36
    assert data["request_id"]

    after = client.get("/metrics").text
    assert 'taskbridge_client_error_reports_total{source="web"} 1' in after
    assert _metric_total(after) == _metric_total(before) + 1


def _metric_total(body: str) -> int:
    for line in body.splitlines():
        if line.startswith("taskbridge_client_error_reports_total "):
            return int(line.rsplit(" ", 1)[1])
    return 0
