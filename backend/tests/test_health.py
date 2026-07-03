from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app


def test_health_endpoint_reports_service_status() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "code": 0,
        "message": "success",
        "data": {
            "status": "ok",
            "service": "TaskBridge API",
            "version": settings.app_version,
        },
    }


def test_web_cors_preflight_allows_configured_local_web_origin() -> None:
    client = TestClient(create_app())
    origin = "http://127.0.0.1:8080"

    response = client.options(
        "/api/v1/tasks",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "GET" in response.headers["access-control-allow-methods"]
    assert "Authorization" in response.headers["access-control-allow-headers"]


def test_web_cors_preflight_does_not_reflect_unconfigured_origins() -> None:
    client = TestClient(create_app())

    response = client.options(
        "/api/v1/tasks",
        headers={
            "Origin": "https://example.invalid",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_web_cors_preflight_allows_development_wildcard_origin() -> None:
    previous_origins = settings.web_cors_origins
    settings.web_cors_origins = "*"
    try:
        client = TestClient(create_app())

        response = client.options(
            "/api/v1/tasks",
            headers={
                "Origin": "http://192.168.1.10:8080",
                "Access-Control-Request-Method": "GET",
            },
        )
    finally:
        settings.web_cors_origins = previous_origins

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
