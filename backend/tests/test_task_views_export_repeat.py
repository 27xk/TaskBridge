from fastapi.testclient import TestClient

from tests.conftest import auth_headers, register_test_device


def test_task_views_meta_and_export(client: TestClient) -> None:
    headers = auth_headers(client, "views-user", "views@example.com")

    client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Overdue invoice",
            "project": "finance",
            "tag": "bill",
            "priority": 4,
            "due_time": "2026-05-17T09:00:00Z",
        },
    )
    client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Today planning",
            "project": "work",
            "tag": "plan",
            "planned_date": "2026-05-18",
            "list_type": "today",
        },
    )

    overdue_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"view": "overdue", "now": "2026-05-18T12:00:00Z"},
    )
    assert overdue_response.status_code == 200
    overdue_titles = [item["title"] for item in overdue_response.json()["data"]]
    assert overdue_titles == ["Overdue invoice"]

    meta_response = client.get("/api/v1/tasks/meta", headers=headers)
    assert meta_response.status_code == 200
    meta = meta_response.json()["data"]
    assert meta["projects"] == ["finance", "work"]
    assert meta["tags"] == ["bill", "plan"]
    assert meta["counts"]["open"] == 2
    assert meta["counts"]["overdue"] == 1

    export_response = client.get("/api/v1/tasks/export", headers=headers)
    assert export_response.status_code == 200
    exported = export_response.json()["data"]
    assert exported["format"] == "json"
    assert {task["title"] for task in exported["tasks"]} == {"Overdue invoice", "Today planning"}

    csv_response = client.get("/api/v1/tasks/export", headers=headers, params={"format": "csv"})
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "Overdue invoice" in csv_response.text


def test_complete_repeat_task_creates_next_occurrence(client: TestClient) -> None:
    headers = auth_headers(client, "repeat-user", "repeat@example.com")
    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Daily standup",
            "repeat_rule": "daily",
            "planned_date": "2026-05-18",
            "due_time": "2026-05-18T09:00:00Z",
        },
    )
    task_id = create_response.json()["data"]["id"]

    complete_response = client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)
    assert complete_response.status_code == 200

    list_response = client.get("/api/v1/tasks", headers=headers, params={"q": "Daily standup"})
    assert list_response.status_code == 200
    tasks = list_response.json()["data"]
    assert len(tasks) == 2
    assert any(task["status"] == "completed" for task in tasks)
    next_task = next(task for task in tasks if task["status"] == "todo")
    assert next_task["parent_task_id"] == task_id
    assert next_task["planned_date"] == "2026-05-19"
    assert next_task["due_time"].startswith("2026-05-19T09:00:00")


def test_sync_complete_repeat_task_creates_next_occurrence(client: TestClient) -> None:
    headers = auth_headers(client, "repeat-sync-user", "repeat-sync@example.com")
    register_test_device(client, headers, "windows-repeat", "windows")
    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Weekly review",
            "repeat_rule": "weekly",
            "planned_date": "2026-05-18",
            "due_time": "2026-05-18T17:00:00Z",
        },
    )
    task = create_response.json()["data"]

    push_response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={
            "device_id": "windows-repeat",
            "changes": [
                {
                    "local_id": "local-weekly-review",
                    "server_id": task["id"],
                    "action": "complete",
                    "version": task["version"],
                    "local_updated_at": "2026-05-18T17:30:00Z",
                },
            ],
        },
    )
    assert push_response.status_code == 200
    assert push_response.json()["data"]["results"][0]["status"] == "applied"

    pull_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    changed = pull_response.json()["data"]["changed_tasks"]
    assert any(item["status"] == "completed" and item["id"] == task["id"] for item in changed)
    next_task = next(item for item in changed if item["parent_task_id"] == task["id"])
    assert next_task["planned_date"] == "2026-05-25"
