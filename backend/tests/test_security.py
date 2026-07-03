import pytest
from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.core.config import Settings
from app.core.exceptions import AppException
from tests.conftest import auth_headers, register_test_device


def test_task_parent_must_belong_to_current_user(client: TestClient) -> None:
    owner_headers = auth_headers(client, "parent-owner", "parent-owner@example.com", "owner-device")
    other_headers = auth_headers(client, "parent-other", "parent-other@example.com", "other-device")

    parent_response = client.post(
        "/api/v1/tasks",
        headers=owner_headers,
        json={"title": "Owner parent"},
    )
    assert parent_response.status_code == 201
    parent_id = parent_response.json()["data"]["id"]

    allowed_response = client.post(
        "/api/v1/tasks",
        headers=owner_headers,
        json={"title": "Owner child", "parent_task_id": parent_id},
    )
    assert allowed_response.status_code == 201
    assert allowed_response.json()["data"]["parent_task_id"] == parent_id

    rejected_response = client.post(
        "/api/v1/tasks",
        headers=other_headers,
        json={"title": "Cross user child", "parent_task_id": parent_id},
    )
    assert rejected_response.status_code == 404
    assert rejected_response.json()["message"] == "parent task not found"


def test_sync_parent_task_must_belong_to_current_user(client: TestClient) -> None:
    owner_headers = auth_headers(client, "sync-parent-owner", "sync-parent-owner@example.com", "owner-device")
    other_headers = auth_headers(client, "sync-parent-other", "sync-parent-other@example.com", "other-device")
    register_test_device(client, other_headers, "other-device", "android")

    parent_response = client.post(
        "/api/v1/tasks",
        headers=owner_headers,
        json={"title": "Owner sync parent"},
    )
    parent_id = parent_response.json()["data"]["id"]

    create_response = client.post(
        "/api/v1/sync/push",
        headers=other_headers,
        json={
            "device_id": "other-device",
            "changes": [
                {
                    "local_id": "cross-parent-create",
                    "server_id": None,
                    "action": "create",
                    "title": "Cross parent create",
                    "parent_task_id": parent_id,
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )
    assert create_response.status_code == 200
    create_result = create_response.json()["data"]["results"][0]
    assert create_result["status"] == "failed"
    assert create_result["message"] == "parent task not found"

    own_create = client.post(
        "/api/v1/sync/push",
        headers=other_headers,
        json={
            "device_id": "other-device",
            "changes": [
                {
                    "local_id": "own-child",
                    "server_id": None,
                    "action": "create",
                    "title": "Own child",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:01:00Z",
                },
            ],
        },
    )
    own_id = own_create.json()["data"]["results"][0]["server_id"]

    update_response = client.post(
        "/api/v1/sync/push",
        headers=other_headers,
        json={
            "device_id": "other-device",
            "changes": [
                {
                    "local_id": "own-child",
                    "server_id": own_id,
                    "action": "update",
                    "parent_task_id": parent_id,
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:02:00Z",
                },
            ],
        },
    )
    assert update_response.status_code == 200
    update_result = update_response.json()["data"]["results"][0]
    assert update_result["status"] == "failed"
    assert update_result["message"] == "parent task not found"


def test_websocket_ticket_requires_registered_device(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "ticket-user",
            "email": "ticket-user@example.com",
            "password": "password123",
            "device_id": "ticket-device",
        },
    )
    token = register_response.json()["data"]["access_token"]

    response = client.post(
        "/api/v1/auth/ws-ticket",
        headers={"Authorization": f"Bearer {token}"},
        json={"device_id": "missing-device"},
    )

    assert response.status_code == 403
    assert response.json()["message"] == "device is not registered"


def test_websocket_ticket_fails_closed_in_production_when_redis_is_unavailable(
    monkeypatch,
) -> None:
    import app.services.websocket_ticket_service as ticket_module

    class BrokenRedis:
        def setex(self, key: str, seconds: int, value: str) -> None:
            raise RedisError("redis unavailable")

        def get(self, key: str):  # noqa: ANN001
            raise RedisError("redis unavailable")

        def delete(self, key: str) -> None:
            raise RedisError("redis unavailable")

    monkeypatch.setattr(ticket_module, "get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr(ticket_module.settings, "environment", "production")

    with pytest.raises(AppException) as exc_info:
        ticket_module.issue_websocket_ticket(1, "ticket-prod-device", 1)

    assert exc_info.value.status_code == 503
    assert exc_info.value.message == "websocket ticket store unavailable"


def test_sync_push_rejects_oversized_change_batch(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "batch-user",
            "email": "batch-user@example.com",
            "password": "password123",
            "device_id": "desktop-oversized",
        },
    )
    token = register_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "desktop-oversized",
            "device_name": "Desktop",
            "device_type": "windows",
        },
    )

    response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "desktop-oversized",
            "changes": [
                {
                    "local_id": f"local-{index}",
                    "server_id": None,
                    "action": "create",
                    "title": "Oversized",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:10:00Z",
                }
                for index in range(501)
            ],
        },
    )

    assert response.status_code == 422


def test_production_rejects_invalid_trusted_proxy_ips() -> None:
    settings = Settings(
        environment="production",
        jwt_secret="x" * 32,
        database_url="mysql+pymysql://taskbridge:secure-password@127.0.0.1:3306/taskbridge",
        metrics_token="metrics-secret",
        trusted_proxy_ips="127.0.0.1,10.0.0.0/8,not-a-proxy",
    )

    try:
        settings.validate_runtime_security()
    except ValueError as exc:
        assert "TRUSTED_PROXY_IPS" in str(exc)
    else:
        raise AssertionError("production must reject invalid TRUSTED_PROXY_IPS entries")


def test_production_rejects_open_trusted_proxy_ranges() -> None:
    for trusted_proxy_ips in ["*", "0.0.0.0/0", "::/0"]:
        settings = Settings(
            environment="production",
            jwt_secret="x" * 32,
            database_url="mysql+pymysql://taskbridge:secure-password@127.0.0.1:3306/taskbridge",
            metrics_token="metrics-secret",
            trusted_proxy_ips=trusted_proxy_ips,
        )

        try:
            settings.validate_runtime_security()
        except ValueError as exc:
            assert "TRUSTED_PROXY_IPS" in str(exc)
        else:
            raise AssertionError(
                f"production must reject open TRUSTED_PROXY_IPS entry {trusted_proxy_ips}",
            )


def test_production_rejects_wildcard_web_cors_origins() -> None:
    settings = Settings(
        environment="production",
        jwt_secret="x" * 32,
        database_url="mysql+pymysql://taskbridge:secure-password@127.0.0.1:3306/taskbridge",
        metrics_token="metrics-secret",
        web_cors_origins="*",
    )

    try:
        settings.validate_runtime_security()
    except ValueError as exc:
        assert "WEB_CORS_ORIGINS" in str(exc)
    else:
        raise AssertionError("production must reject wildcard WEB_CORS_ORIGINS")
