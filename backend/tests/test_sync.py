from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.sync_log import SyncLog
from app.models.task import Task
from app.models.user import User
from app.schemas.sync import SyncPushRequest
from app.services.sync_service import push_changes
from tests.conftest import auth_headers, register_test_device


def test_sync_status_reports_runtime_capabilities(client, monkeypatch) -> None:
    import app.api.v1.sync as sync_module

    monkeypatch.setattr(sync_module, "redis_health_status", lambda: "ok")
    response = client.get("/api/v1/sync/status")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "ready"
    assert data["database"] == "ok"
    assert data["redis"] == "ok"
    assert data["websocket"] == "enabled"
    assert data["server_time"].endswith("Z")
    assert data["limits"] == {
        "push_max_changes": 100,
        "pull_default_limit": 200,
        "pull_max_limit": 500,
    }


def test_sync_status_reports_degraded_redis(client, monkeypatch) -> None:
    import app.api.v1.sync as sync_module

    monkeypatch.setattr(sync_module, "redis_health_status", lambda: "degraded")
    response = client.get("/api/v1/sync/status")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "degraded"
    assert data["database"] == "ok"
    assert data["redis"] == "degraded"
    assert data["websocket"] == "degraded"
    assert data["server_time"].endswith("Z")


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


def test_sync_push_does_not_cleanup_logs_on_request(client) -> None:
    headers = auth_headers(client, "sync-no-cleanup-user", "sync-no-cleanup@example.com")
    register_test_device(client, headers, "sync-no-cleanup-device", "windows")
    from app.services import sync_service

    assert not hasattr(sync_service, "cleanup_sync_logs")

    response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "sync-no-cleanup-device",
            "changes": [
                {
                    "local_id": "sync-no-cleanup-task",
                    "server_id": None,
                    "action": "create",
                    "title": "No cleanup task",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["results"][0]["status"] == "applied"


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


def test_sync_push_rejects_reused_idempotency_key_with_different_payload(
    client,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "sync-idempotency-mismatch", "sync-idempotency-mismatch@example.com")
    register_test_device(client, headers, "android-idempotency-mismatch", "android")
    payload = {
        "device_id": "android-idempotency-mismatch",
        "changes": [
            {
                "local_id": "retry-create-mismatch",
                "server_id": None,
                "action": "create",
                "title": "Original offline title",
                "version": 0,
                "local_updated_at": "2026-05-17T12:00:00Z",
            },
        ],
    }

    first_response = client.post("/api/v1/sync/push", headers=headers, json=payload)
    mismatch_payload = {
        **payload,
        "changes": [
            {
                **payload["changes"][0],
                "title": "Mutated retry title",
            },
        ],
    }
    second_response = client.post("/api/v1/sync/push", headers=headers, json=mismatch_payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_result = first_response.json()["data"]["results"][0]
    second_result = second_response.json()["data"]["results"][0]
    assert first_result["status"] == "applied"
    assert second_result["status"] == "failed"
    assert second_result["server_id"] == first_result["server_id"]
    assert second_result["message"] == "idempotency key reused with different payload"

    tasks = list(db_session.scalars(select(Task).order_by(Task.id)))
    assert [task.title for task in tasks] == ["Original offline title"]
    logs = list(db_session.scalars(select(SyncLog).order_by(SyncLog.id)))
    assert [(log.action, log.result, log.client_version) for log in logs] == [("create", "applied", 0)]


def test_sync_push_does_not_retry_unrelated_integrity_errors(client, db_session: Session, monkeypatch) -> None:
    headers = auth_headers(client, "sync-integrity-user", "sync-integrity@example.com")
    register_test_device(client, headers, "android-integrity", "android")
    user = db_session.scalar(select(User).where(User.username == "sync-integrity-user"))
    assert user is not None
    payload = SyncPushRequest.model_validate(
        {
            "device_id": "android-integrity",
            "changes": [
                {
                    "local_id": "integrity-error-create",
                    "server_id": None,
                    "action": "create",
                    "title": "Do not retry unrelated integrity errors",
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )
    commit_calls = 0

    def raise_unrelated_integrity_error() -> None:
        nonlocal commit_calls
        commit_calls += 1
        raise IntegrityError(
            "INSERT INTO unrelated_table",
            {},
            Exception("UNIQUE constraint failed: unrelated_table.name"),
        )

    monkeypatch.setattr(db_session, "commit", raise_unrelated_integrity_error)

    with pytest.raises(IntegrityError):
        push_changes(db_session, user, payload)

    assert commit_calls == 1


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


def test_sync_stale_update_merges_when_changed_fields_do_not_overlap(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-merge-user", "sync-merge@example.com")
    register_test_device(client, headers, "windows-merge", "windows")
    register_test_device(client, headers, "android-merge", "android")

    create_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-merge",
            "changes": [
                {
                    "local_id": "merge-task",
                    "server_id": None,
                    "action": "create",
                    "title": "Original title",
                    "priority": 1,
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )
    server_id = create_response.json()["data"]["results"][0]["server_id"]

    title_update_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-merge",
            "changes": [
                {
                    "local_id": "merge-task-title",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Server title",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:01:00Z",
                },
            ],
        },
    )
    assert title_update_response.json()["data"]["results"][0]["version"] == 2

    stale_priority_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-merge",
            "changes": [
                {
                    "local_id": "merge-task-priority",
                    "server_id": server_id,
                    "action": "update",
                    "priority": 4,
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:02:00Z",
                },
            ],
        },
    )

    result = stale_priority_response.json()["data"]["results"][0]
    assert result["status"] == "applied"
    assert result["version"] == 3
    assert result["task"]["title"] == "Server title"
    assert result["task"]["priority"] == 4

    task = db_session.scalar(select(Task).where(Task.id == server_id))
    assert task is not None
    assert task.title == "Server title"
    assert task.priority == 4


def test_sync_stale_update_conflicts_when_same_field_changed(client) -> None:
    headers = auth_headers(client, "sync-overlap-user", "sync-overlap@example.com")
    register_test_device(client, headers, "windows-overlap", "windows")
    register_test_device(client, headers, "android-overlap", "android")

    create_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-overlap",
            "changes": [
                {
                    "local_id": "overlap-task",
                    "server_id": None,
                    "action": "create",
                    "title": "Original title",
                    "priority": 1,
                    "version": 0,
                    "local_updated_at": "2026-05-17T12:00:00Z",
                },
            ],
        },
    )
    server_id = create_response.json()["data"]["results"][0]["server_id"]

    client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-overlap",
            "changes": [
                {
                    "local_id": "overlap-server-title",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Server title",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:01:00Z",
                },
            ],
        },
    )

    stale_title_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-overlap",
            "changes": [
                {
                    "local_id": "overlap-client-title",
                    "server_id": server_id,
                    "action": "update",
                    "title": "Client title",
                    "version": 1,
                    "local_updated_at": "2026-05-17T12:02:00Z",
                },
            ],
        },
    )

    result = stale_title_response.json()["data"]["results"][0]
    assert result["status"] == "conflict"
    assert result["server_task"]["title"] == "Server title"


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


def test_sync_pull_paginates_changed_and_deleted_tasks(client, db_session: Session) -> None:
    headers = auth_headers(client, "sync-page-user", "sync-page@example.com")
    user = db_session.scalar(select(User).where(User.username == "sync-page-user"))
    assert user is not None

    base_time = datetime(2026, 5, 17, 12, 0, 0)
    tasks = [
        Task(
            user_id=user.id,
            title=f"Paged task {index}",
            status="todo",
            version=1,
            is_deleted=index == 2,
            updated_at=base_time + timedelta(minutes=index),
            created_at=base_time + timedelta(minutes=index),
        )
        for index in range(3)
    ]
    db_session.add_all(tasks)
    db_session.commit()

    first_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={
            "last_sync_time": "1970-01-01T00:00:00Z",
            "limit": 2,
        },
    )

    assert first_response.status_code == 200
    first_page = first_response.json()["data"]
    assert first_page["has_more"] is True
    assert first_page["next_cursor_updated_at"] == "2026-05-17T12:01:00Z"
    assert first_page["next_cursor_id"] == tasks[1].id
    assert [task["title"] for task in first_page["changed_tasks"]] == ["Paged task 0", "Paged task 1"]
    assert first_page["deleted_tasks"] == []

    second_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={
            "last_sync_time": "1970-01-01T00:00:00Z",
            "limit": 2,
            "cursor_updated_at": first_page["next_cursor_updated_at"],
            "cursor_id": first_page["next_cursor_id"],
        },
    )

    assert second_response.status_code == 200
    second_page = second_response.json()["data"]
    assert second_page["has_more"] is False
    assert second_page["next_cursor_updated_at"] is None
    assert second_page["next_cursor_id"] is None
    assert second_page["changed_tasks"] == []
    assert [task["title"] for task in second_page["deleted_tasks"]] == ["Paged task 2"]
