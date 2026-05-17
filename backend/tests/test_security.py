from fastapi.testclient import TestClient


def test_websocket_ticket_requires_registered_device(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "ticket-user",
            "email": "ticket-user@example.com",
            "password": "password123",
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


def test_sync_push_rejects_oversized_change_batch(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "batch-user",
            "email": "batch-user@example.com",
            "password": "password123",
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
