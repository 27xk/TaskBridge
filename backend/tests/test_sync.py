from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.sync_log import SyncLog
from tests.conftest import auth_headers, register_test_device


def test_sync_push_pull_conflict_and_deleted_tasks(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-user", "sync-user@example.com")
    register_test_device(client, headers, "android-001", "android")

    create_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-001",
            "changes": [
                {
                    "local_id": "local-task-1",
                    "server_id": None,
                    "action": "create",
                    "title": "Offline task",
                    "content": "Created while offline",
                    "status": "todo",
                    "priority": 2,
                    "tag": "mobile",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )

    assert create_response.status_code == 200
    create_data = create_response.json()["data"]
    create_result = create_data["results"][0]
    assert create_result["status"] == "applied"
    assert create_result["server_id"] > 0
    assert create_result["version"] == 1
    assert create_data["server_time"].endswith("Z")

    server_id = create_result["server_id"]

    pull_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )

    assert pull_response.status_code == 200
    pull_data = pull_response.json()["data"]
    assert [task["id"] for task in pull_data["changed_tasks"]] == [server_id]
    assert pull_data["deleted_tasks"] == []
    assert pull_data["server_time"].endswith("Z")

    update_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-001",
            "changes": [
                {
                    "local_id": "local-task-1",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Updated offline task",
                    "priority": 3,
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:05:00Z",
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
            "device_id": "android-001",
            "changes": [
                {
                    "local_id": "local-task-1",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Stale edit",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:06:00Z",
                },
            ],
        },
    )

    assert conflict_response.status_code == 200
    conflict_result = conflict_response.json()["data"]["results"][0]
    assert conflict_result["status"] == "conflict"
    assert conflict_result["server_task"]["version"] == 2

    delete_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-001",
            "changes": [
                {
                    "local_id": "local-task-1",
                    "server_id": server_id,
                    "action": "delete",
                    "version": 2,
                    "local_updated_at": "2026-05-17T12:07:00Z",
                },
            ],
        },
    )

    assert delete_response.status_code == 200
    delete_result = delete_response.json()["data"]["results"][0]
    assert delete_result["status"] == "applied"
    assert delete_result["version"] == 3

    pull_after_delete = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )

    pull_after_delete_data = pull_after_delete.json()["data"]
    assert pull_after_delete_data["changed_tasks"] == []
    assert [task["id"] for task in pull_after_delete_data["deleted_tasks"]] == [server_id]

    logs = list(db_session.scalars(select(SyncLog).order_by(SyncLog.id)))
    assert [log.action for log in logs] == ["create", "update", "delete"]
    assert {log.device_id for log in logs} == {"android-001"}


def test_sync_push_validates_action_and_server_id(client) -> None:
    headers = auth_headers(client, "sync-error-user", "sync-error-user@example.com")
    register_test_device(client, headers, "android-001", "android")

    response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-001",
            "changes": [
                {
                    "local_id": "missing-server",
                    "server_id": None,
                    "action": "update",
                    "title": "Cannot update",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )

    assert response.status_code == 200
    result = response.json()["data"]["results"][0]
    assert result["status"] == "failed"
    assert result["message"] == "server_id is required"


def test_sync_push_is_idempotent_for_retried_create(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-idempotent-user", "sync-idempotent@example.com")
    register_test_device(client, headers, "android-idempotent", "android")

    payload = {
        "device_id": "android-idempotent",
        "changes": [
            {
                "local_id": "retry-create-1",
                "server_id": None,
                "action": "create",
                "title": "Created once",
                "version": 0,
                "local_updated_at": "2026-05-17T12:00:00Z",
            },
        ],
    }

    first_response = client.post("/api/v1/sync/push", headers=headers, json=payload)
    second_response = client.post("/api/v1/sync/push", headers=headers, json=payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_result = first_response.json()["data"]["results"][0]
    second_result = second_response.json()["data"]["results"][0]
    assert first_result["status"] == "applied"
    assert second_result["status"] == "applied"
    assert second_result["server_id"] == first_result["server_id"]
    assert second_result["version"] == first_result["version"]

    pull_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    changed_tasks = pull_response.json()["data"]["changed_tasks"]
    assert [task["title"] for task in changed_tasks] == ["Created once"]

    logs = list(db_session.scalars(select(SyncLog).order_by(SyncLog.id)))
    assert [log.action for log in logs] == ["create"]


def test_sync_create_rejects_blank_title_without_log(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-blank-user", "sync-blank@example.com")
    register_test_device(client, headers, "android-blank", "android")

    response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-blank",
            "changes": [
                {
                    "local_id": "blank-title",
                    "server_id": None,
                    "action": "create",
                    "title": "   ",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )

    assert response.status_code == 200
    result = response.json()["data"]["results"][0]
    assert result["status"] == "failed"
    assert result["message"] == "title is required"
    assert list(db_session.scalars(select(SyncLog))) == []


def test_sync_conflict_does_not_write_success_log(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-conflict-user", "sync-conflict@example.com")
    register_test_device(client, headers, "windows-001", "windows")
    register_test_device(client, headers, "android-001", "android")

    create_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-001",
            "changes": [
                {
                    "local_id": "conflict-task",
                    "server_id": None,
                    "action": "create",
                    "title": "Conflict task",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )
    server_id = create_response.json()["data"]["results"][0]["server_id"]

    update_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-001",
            "changes": [
                {
                    "local_id": "conflict-task",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Server wins",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:01:00Z",
                },
            ],
        },
    )
    assert update_response.json()["data"]["results"][0]["status"] == "applied"

    conflict_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-001",
            "changes": [
                {
                    "local_id": "conflict-task",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Stale client edit",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:02:00Z",
                },
            ],
        },
    )

    result = conflict_response.json()["data"]["results"][0]
    assert result["status"] == "conflict"
    logs = list(db_session.scalars(select(SyncLog).order_by(SyncLog.id)))
    assert [log.action for log in logs] == ["create", "update"]


def test_sync_restore_reopens_deleted_task_and_increments_version(client) -> None:
    headers = auth_headers(client, "sync-restore-user", "sync-restore@example.com")
    register_test_device(client, headers, "desktop-restore", "windows")

    create_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "desktop-restore",
            "changes": [
                {
                    "local_id": "restore-task",
                    "server_id": None,
                    "action": "create",
                    "title": "Restore me",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )
    server_id = create_response.json()["data"]["results"][0]["server_id"]

    delete_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "desktop-restore",
            "changes": [
                {
                    "local_id": "restore-task",
                    "server_id": server_id,
                    "action": "delete",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:01:00Z",
                },
            ],
        },
    )
    assert delete_response.json()["data"]["results"][0]["version"] == 2

    restore_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "desktop-restore",
            "changes": [
                {
                    "local_id": "restore-task",
                    "server_id": server_id,
                    "action": "restore",
                    "version": 2,
                    "local_updated_at": "2026-05-17T12:02:00Z",
                },
            ],
        },
    )

    restore_result = restore_response.json()["data"]["results"][0]
    assert restore_result["status"] == "applied"
    assert restore_result["version"] == 3
    assert restore_result["task"]["is_deleted"] is False
    assert restore_result["task"]["status"] == "todo"

    pull_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    pull_data = pull_response.json()["data"]
    assert [task["id"] for task in pull_data["changed_tasks"]] == [server_id]
    assert pull_data["deleted_tasks"] == []
