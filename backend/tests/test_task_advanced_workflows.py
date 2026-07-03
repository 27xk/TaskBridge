from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_checklist_item_lifecycle_and_history(client: TestClient) -> None:
    headers = auth_headers(client, "checklist-user", "checklist@example.com")
    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Prepare launch", "checklist": [{"id": "draft", "title": "Draft notes", "done": False}]},
    )
    task_id = create_response.json()["data"]["id"]

    add_response = client.post(
        f"/api/v1/tasks/{task_id}/checklist",
        headers=headers,
        json={"id": "qa", "title": "QA pass", "done": False},
    )
    assert add_response.status_code == 200
    assert [item["id"] for item in add_response.json()["data"]["checklist"]] == ["draft", "qa"]

    update_response = client.put(
        f"/api/v1/tasks/{task_id}/checklist/qa",
        headers=headers,
        json={"title": "QA checklist", "done": True},
    )
    assert update_response.status_code == 200
    updated_item = update_response.json()["data"]["checklist"][1]
    assert updated_item == {"id": "qa", "title": "QA checklist", "done": True}

    delete_response = client.delete(f"/api/v1/tasks/{task_id}/checklist/draft", headers=headers)
    assert delete_response.status_code == 200
    assert [item["id"] for item in delete_response.json()["data"]["checklist"]] == ["qa"]

    history_response = client.get(f"/api/v1/tasks/{task_id}/history", headers=headers)
    assert history_response.status_code == 200
    operations = [item["operation"] for item in history_response.json()["data"]]
    assert "created" in operations
    assert "checklist_added" in operations
    assert "checklist_updated" in operations
    assert "checklist_deleted" in operations


def test_templates_can_be_instantiated_without_mutating_template(client: TestClient) -> None:
    headers = auth_headers(client, "template-user", "template@example.com")
    template_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Weekly review",
            "content": "Review notes and actions.",
            "tag": "work",
            "priority": 3,
            "is_template": True,
            "template_name": "Weekly review template",
            "checklist": [{"id": "notes", "title": "Collect notes", "done": False}],
        },
    )
    template = template_response.json()["data"]

    instantiate_response = client.post(
        f"/api/v1/tasks/templates/{template['id']}/instantiate",
        headers=headers,
        json={
            "title": "Weekly review 2026-W21",
            "planned_date": "2026-05-18",
            "due_time": "2026-05-18T18:00:00Z",
        },
    )

    assert instantiate_response.status_code == 201
    created = instantiate_response.json()["data"]
    assert created["id"] != template["id"]
    assert created["title"] == "Weekly review 2026-W21"
    assert created["is_template"] is False
    assert created["template_name"] is None
    assert created["planned_date"] == "2026-05-18"
    assert created["checklist"][0]["id"] == "notes"

    templates_response = client.get("/api/v1/tasks", headers=headers, params={"templates_only": True})
    assert [item["id"] for item in templates_response.json()["data"]] == [template["id"]]


def test_repeat_next_occurrence_and_trash_purge(client: TestClient) -> None:
    headers = auth_headers(client, "repeat-user", "repeat@example.com")
    task_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Daily standup",
            "due_time": "2026-05-18T09:00:00Z",
            "planned_date": "2026-05-18",
            "repeat_rule": "daily",
        },
    )
    task = task_response.json()["data"]

    next_response = client.post(f"/api/v1/tasks/{task['id']}/next-occurrence", headers=headers)
    assert next_response.status_code == 201
    next_task = next_response.json()["data"]
    assert next_task["title"] == "Daily standup"
    assert next_task["due_time"].startswith("2026-05-19T09:00:00")
    assert next_task["planned_date"] == "2026-05-19"
    assert next_task["repeat_rule"] == "daily"

    delete_response = client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
    assert delete_response.status_code == 200

    trash_response = client.get("/api/v1/tasks/trash", headers=headers)
    assert trash_response.status_code == 200
    assert [item["id"] for item in trash_response.json()["data"]] == [task["id"]]

    purge_response = client.delete(f"/api/v1/tasks/{task['id']}/purge", headers=headers)
    assert purge_response.status_code == 200
    assert purge_response.json()["data"]["id"] == task["id"]

    trash_after_purge = client.get("/api/v1/tasks/trash", headers=headers)
    assert trash_after_purge.json()["data"] == []


def test_task_list_supports_small_page_windows(client: TestClient) -> None:
    headers = auth_headers(client, "page-user", "page@example.com")
    for index in range(5):
        response = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"title": f"Task {index}", "sort_order": index},
        )
        assert response.status_code == 201

    page_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"offset": 1, "limit": 2},
    )

    assert page_response.status_code == 200
    page = page_response.json()["data"]
    assert len(page) == 2
    assert [item["title"] for item in page] == ["Task 1", "Task 2"]


def test_sync_push_rejects_oversized_batches(client: TestClient) -> None:
    headers = auth_headers(client, "batch-user", "batch@example.com")
    changes = [
        {
            "local_id": f"local-{index}",
            "server_id": None,
            "action": "create",
            "title": f"Task {index}",
            "version": 0,
            "local_updated_at": "2026-05-18T08:00:00Z",
        }
        for index in range(101)
    ]

    response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={"device_id": "not-registered", "changes": changes},
    )

    assert response.status_code == 422
