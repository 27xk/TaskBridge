from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_task_crud_complete_restore_and_soft_delete(client: TestClient) -> None:
    headers = auth_headers(client, "task-user", "task-user@example.com")

    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Write sync API",
            "content": "Implement local-first task sync endpoints.",
            "priority": 2,
            "tag": "backend",
        },
    )

    assert create_response.status_code == 201
    task = create_response.json()["data"]
    assert task["title"] == "Write sync API"
    assert task["status"] == "todo"
    assert task["version"] == 1

    task_id = task["id"]

    list_response = client.get("/api/v1/tasks", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    get_response = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["data"]["id"] == task_id

    update_response = client.put(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        json={"title": "Write task API", "priority": 3},
    )
    assert update_response.status_code == 200
    updated_task = update_response.json()["data"]
    assert updated_task["title"] == "Write task API"
    assert updated_task["priority"] == 3
    assert updated_task["version"] == 2

    complete_response = client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)
    assert complete_response.status_code == 200
    assert complete_response.json()["data"]["status"] == "completed"
    assert complete_response.json()["data"]["completed_at"] is not None

    undo_response = client.post(f"/api/v1/tasks/{task_id}/undo-complete", headers=headers)
    assert undo_response.status_code == 200
    assert undo_response.json()["data"]["status"] == "todo"
    assert undo_response.json()["data"]["completed_at"] is None

    restore_response = client.post(f"/api/v1/tasks/{task_id}/restore", headers=headers)
    assert restore_response.status_code == 200
    assert restore_response.json()["data"]["status"] == "todo"

    delete_response = client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["is_deleted"] is True

    hidden_response = client.get("/api/v1/tasks", headers=headers)
    assert hidden_response.status_code == 200
    assert hidden_response.json()["data"] == []


def test_users_cannot_access_other_users_tasks(client: TestClient) -> None:
    owner_headers = auth_headers(client, "owner", "owner@example.com")
    other_headers = auth_headers(client, "other", "other@example.com")

    create_response = client.post(
        "/api/v1/tasks",
        headers=owner_headers,
        json={"title": "Private task"},
    )
    task_id = create_response.json()["data"]["id"]

    response = client.get(f"/api/v1/tasks/{task_id}", headers=other_headers)

    assert response.status_code == 404
    assert response.json() == {"code": 404, "message": "task not found", "data": None}
