from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_bulk_complete_plan_and_rename_meta(client: TestClient) -> None:
    headers = auth_headers(client, "bulk-user", "bulk@example.com")
    first = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Pay rent", "project": "home", "tag": "money"},
    ).json()["data"]
    second = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Buy food", "project": "home", "tag": "money"},
    ).json()["data"]

    complete_response = client.post(
        "/api/v1/tasks/batch",
        headers=headers,
        json={"task_ids": [first["id"], second["id"]], "action": "complete"},
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["data"]["updated_count"] == 2

    plan_response = client.post(
        "/api/v1/tasks/batch",
        headers=headers,
        json={"task_ids": [first["id"]], "action": "plan", "planned_date": "2026-05-20"},
    )
    assert plan_response.status_code == 200
    assert plan_response.json()["data"]["tasks"][0]["planned_date"] == "2026-05-20"

    project_response = client.post(
        "/api/v1/tasks/projects/rename",
        headers=headers,
        json={"old_value": "home", "new_value": "personal"},
    )
    assert project_response.status_code == 200
    assert project_response.json()["data"]["updated_count"] == 2

    tag_response = client.post(
        "/api/v1/tasks/tags/rename",
        headers=headers,
        json={"old_value": "money", "new_value": "life"},
    )
    assert tag_response.status_code == 200
    assert tag_response.json()["data"]["updated_count"] == 2

    meta = client.get("/api/v1/tasks/meta", headers=headers).json()["data"]
    assert meta["projects"] == ["personal"]
    assert meta["tags"] == ["life"]


def test_import_backup_creates_and_updates_owned_tasks(client: TestClient) -> None:
    headers = auth_headers(client, "import-user", "import@example.com")
    existing = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Old title", "project": "legacy"},
    ).json()["data"]

    response = client.post(
        "/api/v1/tasks/import",
        headers=headers,
        json={
            "tasks": [
                {
                    "id": existing["id"],
                    "title": "Updated title",
                    "project": "restored",
                    "status": "todo",
                    "priority": 2,
                    "list_type": "inbox",
                },
                {
                    "title": "Imported task",
                    "tag": "backup",
                    "status": "todo",
                    "priority": 1,
                    "list_type": "inbox",
                },
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["created_count"] == 1
    assert data["updated_count"] == 1

    tasks = client.get("/api/v1/tasks", headers=headers, params={"q": "title"}).json()["data"]
    assert tasks[0]["title"] == "Updated title"
    assert tasks[0]["project"] == "restored"


def test_resolve_conflict_can_return_server_or_overwrite(client: TestClient) -> None:
    headers = auth_headers(client, "conflict-user", "conflict@example.com")
    task = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Server title", "content": "server"},
    ).json()["data"]

    server_response = client.post(
        f"/api/v1/tasks/{task['id']}/resolve-conflict",
        headers=headers,
        json={"strategy": "use_server"},
    )
    assert server_response.status_code == 200
    assert server_response.json()["data"]["title"] == "Server title"

    overwrite_response = client.post(
        f"/api/v1/tasks/{task['id']}/resolve-conflict",
        headers=headers,
        json={
            "strategy": "overwrite_server",
            "task": {"title": "Local wins", "content": "local", "priority": 5},
        },
    )
    assert overwrite_response.status_code == 200
    overwritten = overwrite_response.json()["data"]
    assert overwritten["title"] == "Local wins"
    assert overwritten["priority"] == 5
