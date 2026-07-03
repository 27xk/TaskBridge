from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.models.sync_log import SyncLog
from tests.conftest import auth_headers, register_test_device


def test_sync_e2e_push_notify_pull_update_and_conflict(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-e2e-user", "sync-e2e@example.com", device_id="desktop-e2e")
    register_test_device(client, headers, "desktop-e2e", "windows")
    register_test_device(client, headers, "android-e2e", "android")

    ticket_response = client.post(
        "/api/v1/auth/ws-ticket",
        headers=headers,
        json={"device_id": "desktop-e2e"},
    )
    ticket = ticket_response.json()["data"]["ticket"]

    with client.websocket_connect(f"/ws/sync?ticket={ticket}&device_id=desktop-e2e") as websocket:
        create_response = client.post(
            "/api/v1/sync/push",
            headers=headers,
            json={
                "device_id": "android-e2e",
                "changes": [
                    {
                        "local_id": "phone-e2e-1",
                        "server_id": None,
                        "action": "create",
                        "title": "Phone draft",
                        "version": 0,
                        "local_updated_at": "2026-05-17T12:10:00Z",
                    },
                ],
            },
        )

        assert create_response.status_code == 200
        create_result = create_response.json()["data"]["results"][0]
        assert create_result["status"] == "applied"
        assert create_result["version"] == 1
        task_id = create_result["server_id"]

        notification = websocket.receive_json()
        assert notification["event"] == "task_changed"
        assert notification["action"] == "created"
        assert notification["task_id"] == task_id
        assert notification["version"] == 1

        pull_response = client.get(
            "/api/v1/sync/pull",
            headers=headers,
            params={"last_sync_time": "1970-01-01T00:00:00Z"},
        )

        assert pull_response.status_code == 200
        pull_data = pull_response.json()["data"]
        assert [task["id"] for task in pull_data["changed_tasks"]] == [task_id]
        assert pull_data["changed_tasks"][0]["title"] == "Phone draft"

    update_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "desktop-e2e",
            "changes": [
                {
                    "local_id": "desktop-e2e-1",
                    "server_id": task_id,
                    "action": "update",
                    "title": "Desktop accepted",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:11:00Z",
                },
            ],
        },
    )

    assert update_response.status_code == 200
    update_result = update_response.json()["data"]["results"][0]
    assert update_result["status"] == "applied"
    assert update_result["version"] == 2

    conflict_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-e2e",
            "changes": [
                {
                    "local_id": "phone-e2e-stale",
                    "server_id": task_id,
                    "action": "update",
                    "title": "Phone stale overwrite",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:12:00Z",
                },
            ],
        },
    )

    assert conflict_response.status_code == 200
    conflict_result = conflict_response.json()["data"]["results"][0]
    assert conflict_result["status"] == "conflict"
    assert conflict_result["server_task"]["title"] == "Desktop accepted"
    assert conflict_result["server_task"]["version"] == 2

    sync_logs = db_session.scalars(select(SyncLog).order_by(SyncLog.id)).all()
    assert [(log.device_id, log.action, log.result, log.client_version, log.version) for log in sync_logs] == [
        ("android-e2e", "create", "applied", 0, 1),
        ("desktop-e2e", "update", "applied", 1, 2),
    ]


def test_sync_websocket_ping_and_task_change_notification(client) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "socket-user",
            "email": "socket-user@example.com",
            "password": "password123",
            "device_id": "desktop-001",
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


def test_sync_websocket_access_token_requires_active_session(client) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "socket-revoked-session",
            "email": "socket-revoked-session@example.com",
            "password": "password123",
            "device_id": "desktop-ws-revoked",
        },
    )
    token = register_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "desktop-ws-revoked",
            "device_name": "Desktop",
            "device_type": "windows",
        },
    )
    sessions_response = client.get("/api/v1/auth/sessions", headers=headers)
    session_id = sessions_response.json()["data"][0]["id"]
    assert client.delete(f"/api/v1/auth/sessions/{session_id}", headers=headers).status_code == 200

    try:
        with client.websocket_connect("/ws/sync?device_id=desktop-ws-revoked", headers=headers):
            raise AssertionError("revoked access token unexpectedly opened websocket")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401


def test_sync_websocket_ticket_requires_active_issuing_session(client) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "socket-ticket-revoked",
            "email": "socket-ticket-revoked@example.com",
            "password": "password123",
            "device_id": "desktop-ticket-revoked",
        },
    )
    token = register_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "desktop-ticket-revoked",
            "device_name": "Desktop",
            "device_type": "windows",
        },
    )
    ticket_response = client.post(
        "/api/v1/auth/ws-ticket",
        headers=headers,
        json={"device_id": "desktop-ticket-revoked"},
    )
    ticket = ticket_response.json()["data"]["ticket"]
    sessions_response = client.get("/api/v1/auth/sessions", headers=headers)
    session_id = sessions_response.json()["data"][0]["id"]
    assert client.delete(f"/api/v1/auth/sessions/{session_id}", headers=headers).status_code == 200

    try:
        with client.websocket_connect(f"/ws/sync?ticket={ticket}&device_id=desktop-ticket-revoked"):
            raise AssertionError("ticket from revoked session unexpectedly opened websocket")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401


def test_sync_push_rejects_unregistered_device(client) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "device-check-user",
            "email": "device-check@example.com",
            "password": "password123",
            "device_id": "device-check",
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
