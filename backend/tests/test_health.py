from fastapi.testclient import TestClient

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
            "version": "0.1.3",
        },
    }
