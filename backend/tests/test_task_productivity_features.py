from fastapi.testclient import TestClient

from tests.conftest import auth_headers, register_test_device


def test_task_enhanced_fields_search_postpone_snooze_and_undo(client: TestClient) -> None:
    headers = auth_headers(client, "productivity-user", "productivity@example.com")

    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Prepare weekly review #work P3",
            "content": "Collect notes and action items.",
            "priority": 3,
            "tag": "work",
            "project": "weekly",
            "list_type": "inbox",
            "planned_date": "2026-05-18",
            "checklist": [
                {"id": "notes", "title": "Collect notes", "done": False},
                {"id": "actions", "title": "Write actions", "done": False},
            ],
        },
    )

    assert create_response.status_code == 201
    task = create_response.json()["data"]
    assert task["project"] == "weekly"
    assert task["list_type"] == "inbox"
    assert task["planned_date"] == "2026-05-18"
    assert task["checklist"][0]["title"] == "Collect notes"
    task_id = task["id"]

    search_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"q": "weekly", "project": "weekly", "list_type": "inbox"},
    )
    assert search_response.status_code == 200
    assert [item["id"] for item in search_response.json()["data"]] == [task_id]

    complete_response = client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)
    assert complete_response.status_code == 200
    assert complete_response.json()["data"]["status"] == "completed"
    assert complete_response.json()["data"]["completed_at"] is not None

    undo_response = client.post(f"/api/v1/tasks/{task_id}/undo-complete", headers=headers)
    assert undo_response.status_code == 200
    assert undo_response.json()["data"]["status"] == "todo"
    assert undo_response.json()["data"]["completed_at"] is None

    postpone_response = client.post(
        f"/api/v1/tasks/{task_id}/postpone",
        headers=headers,
        json={
            "due_time": "2026-05-19T09:30:00Z",
            "remind_time": "2026-05-19T09:00:00Z",
            "planned_date": "2026-05-19",
        },
    )
    assert postpone_response.status_code == 200
    postponed = postpone_response.json()["data"]
    assert postponed["planned_date"] == "2026-05-19"
    assert postponed["due_time"].startswith("2026-05-19T09:30:00")

    snooze_response = client.post(
        f"/api/v1/tasks/{task_id}/snooze",
        headers=headers,
        json={"snoozed_until": "2026-05-19T10:00:00Z"},
    )
    assert snooze_response.status_code == 200
    assert snooze_response.json()["data"]["snoozed_until"].startswith("2026-05-19T10:00:00")


def test_sync_push_and_pull_include_productivity_fields(client: TestClient) -> None:
    headers = auth_headers(client, "sync-productivity", "sync-productivity@example.com")
    register_test_device(client, headers, "android-productivity", "android")

    push_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "android-productivity",
            "changes": [
                {
                    "local_id": "local-inbox-task",
                    "server_id": None,
                    "action": "create",
                    "title": "Inbox idea",
                    "status": "todo",
                    "priority": 4,
                    "tag": "idea",
                    "project": "personal",
                    "list_type": "inbox",
                    "planned_date": "2026-05-18",
                    "snoozed_until": "2026-05-18T18:00:00Z",
                    "checklist": [{"id": "a", "title": "First step", "done": False}],
                    "version": 0,
                    "local_updated_at": "2026-05-18T08:00:00Z",
                },
            ],
        },
    )

    assert push_response.status_code == 200
    result = push_response.json()["data"]["results"][0]
    assert result["status"] == "applied"
    assert result["task"]["project"] == "personal"
    assert result["task"]["checklist"][0]["id"] == "a"

    pull_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    pulled = pull_response.json()["data"]["changed_tasks"][0]
    assert pulled["list_type"] == "inbox"
    assert pulled["planned_date"] == "2026-05-18"
    assert pulled["snoozed_until"].startswith("2026-05-18T18:00:00")
