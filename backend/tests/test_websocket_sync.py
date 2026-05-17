def test_sync_websocket_ping_and_task_change_notification(client) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "socket-user",
            "email": "socket-user@example.com",
            "password": "password123",
        },
    )
    token = register_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "desktop-001",
            "device_name": "Desktop",
            "device_type": "windows",
        },
    )
    client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "android-001",
            "device_name": "Phone",
            "device_type": "android",
        },
    )
    ticket_response = client.post(
        "/api/v1/auth/ws-ticket",
        headers=headers,
        json={"device_id": "desktop-001"},
    )
    ticket = ticket_response.json()["data"]["ticket"]

    with client.websocket_connect(f"/ws/sync?ticket={ticket}&device_id=desktop-001") as websocket:
        websocket.send_text("ping")
        pong = websocket.receive_json()
        assert pong["event"] == "pong"
        assert pong["server_time"].endswith("Z")

        response = client.post(
            "/api/v1/sync/push",
            headers=headers,
            json={
                "device_id": "android-001",
                "changes": [
                    {
                        "local_id": "phone-local-1",
                        "server_id": None,
                        "action": "create",
                        "title": "Notify desktop",
                        "version": 0,
                        "local_updated_at": "2026-05-17T12:10:00Z",
                    },
                ],
            },
        )
        task_id = response.json()["data"]["results"][0]["server_id"]

        notification = websocket.receive_json()
        assert notification["event"] == "task_changed"
        assert notification["action"] == "created"
        assert notification["task_id"] == task_id
        assert notification["version"] == 1
        assert notification["server_time"].endswith("Z")


def test_sync_push_rejects_unregistered_device(client) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "device-check-user",
            "email": "device-check@example.com",
            "password": "password123",
        },
    )
    token = register_response.json()["data"]["access_token"]

    response = client.post(
        "/api/v1/sync/push",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "device_id": "not-registered",
            "changes": [
                {
                    "local_id": "local-1",
                    "server_id": None,
                    "action": "create",
                    "title": "Should fail",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:10:00Z",
                },
            ],
        },
    )

    assert response.status_code == 403
    assert response.json()["message"] == "device is not registered"
