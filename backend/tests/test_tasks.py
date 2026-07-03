from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.sync_log import SyncLog
from app.models.task import Task
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
    version = task["version"]

    list_response = client.get("/api/v1/tasks", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    get_response = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["data"]["id"] == task_id

    update_response = client.put(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        json={"title": "Write task API", "priority": 3, "expected_version": version},
    )
    assert update_response.status_code == 200
    updated_task = update_response.json()["data"]
    assert updated_task["title"] == "Write task API"
    assert updated_task["priority"] == 3
    assert updated_task["version"] == 2
    version = updated_task["version"]

    complete_response = client.post(
        f"/api/v1/tasks/{task_id}/complete",
        headers=headers,
        params={"expected_version": version},
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["data"]["status"] == "completed"
    assert complete_response.json()["data"]["completed_at"] is not None
    version = complete_response.json()["data"]["version"]

    undo_response = client.post(
        f"/api/v1/tasks/{task_id}/undo-complete",
        headers=headers,
        params={"expected_version": version},
    )
    assert undo_response.status_code == 200
    assert undo_response.json()["data"]["status"] == "todo"
    assert undo_response.json()["data"]["completed_at"] is None
    version = undo_response.json()["data"]["version"]

    restore_response = client.post(
        f"/api/v1/tasks/{task_id}/restore",
        headers=headers,
        params={"expected_version": version},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["data"]["status"] == "todo"
    version = restore_response.json()["data"]["version"]

    delete_response = client.delete(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        params={"expected_version": version},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["is_deleted"] is True

    hidden_response = client.get("/api/v1/tasks", headers=headers)
    assert hidden_response.status_code == 200
    assert hidden_response.json()["data"] == []


def test_task_update_rejects_stale_expected_version(client: TestClient, db_session) -> None:
    headers = auth_headers(client, "stale-update", "stale-update@example.com")

    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Initial task"},
    )
    task = create_response.json()["data"]
    task_id = task["id"]

    first_update = client.put(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        json={"title": "Fresh edit", "expected_version": task["version"]},
    )
    assert first_update.status_code == 200
    assert first_update.json()["data"]["version"] == 2

    stale_update = client.put(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        json={"title": "Stale edit", "expected_version": 1},
    )
    assert stale_update.status_code == 409
    assert stale_update.json() == {"code": 409, "message": "version conflict", "data": None}

    latest = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert latest.status_code == 200
    assert latest.json()["data"]["title"] == "Fresh edit"
    assert latest.json()["data"]["version"] == 2

    logs = list(db_session.scalars(select(SyncLog).order_by(SyncLog.id)))
    assert [log.action for log in logs] == ["created", "updated"]


def test_task_delete_rejects_stale_expected_version(client: TestClient, db_session) -> None:
    headers = auth_headers(client, "stale-delete", "stale-delete@example.com")

    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Delete guard"},
    )
    task = create_response.json()["data"]
    task_id = task["id"]

    update_response = client.put(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        json={"title": "Delete guard updated", "expected_version": task["version"]},
    )
    assert update_response.status_code == 200

    stale_delete = client.delete(
        f"/api/v1/tasks/{task_id}",
        headers=headers,
        params={"expected_version": 1},
    )
    assert stale_delete.status_code == 409
    assert stale_delete.json() == {"code": 409, "message": "version conflict", "data": None}

    latest = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert latest.status_code == 200
    assert latest.json()["data"]["is_deleted"] is False
    assert latest.json()["data"]["version"] == 2

    logs = list(db_session.scalars(select(SyncLog).order_by(SyncLog.id)))
    assert [log.action for log in logs] == ["created", "updated"]


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


def test_task_search_matches_all_terms_without_requiring_phrase_order(client: TestClient) -> None:
    headers = auth_headers(client, "search-terms", "search-terms@example.com")
    matching_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Prepare weekly review", "content": "Collect notes and actions."},
    )
    client.post("/api/v1/tasks", headers=headers, json={"title": "Weekly chores"})
    client.post("/api/v1/tasks", headers=headers, json={"title": "Review pull requests"})

    response = client.get("/api/v1/tasks", headers=headers, params={"q": "review weekly"})

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]] == [
        matching_response.json()["data"]["id"]
    ]


def test_task_search_treats_like_wildcards_as_literal_text(client: TestClient) -> None:
    headers = auth_headers(client, "search-wildcard", "search-wildcard@example.com")
    literal_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Reach 100% coverage"},
    )
    client.post("/api/v1/tasks", headers=headers, json={"title": "Reach 100 coverage"})

    response = client.get("/api/v1/tasks", headers=headers, params={"q": "100%"})

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]] == [
        literal_response.json()["data"]["id"]
    ]


def test_task_search_orders_title_matches_before_content_only_matches(client: TestClient) -> None:
    headers = auth_headers(client, "search-ranking", "search-ranking@example.com")
    title_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Launch checklist", "content": "Ship desktop package."},
    )
    content_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Release chores", "content": "Finish the launch checklist."},
    )

    response = client.get("/api/v1/tasks", headers=headers, params={"q": "launch checklist"})

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]] == [
        title_response.json()["data"]["id"],
        content_response.json()["data"]["id"],
    ]


def test_task_list_supports_timeline_cursor_pagination(client: TestClient, db_session) -> None:
    headers = auth_headers(client, "cursor-page", "cursor-page@example.com")
    created_ids = []
    for title in ("Overdue", "Future due", "Planned", "Inbox high", "Inbox low"):
        response = client.post("/api/v1/tasks", headers=headers, json={"title": title})
        assert response.status_code == 201
        created_ids.append(response.json()["data"]["id"])

    tasks = {
        task.title: task
        for task in db_session.scalars(select(Task).where(Task.id.in_(created_ids)))
    }
    tasks["Overdue"].due_time = datetime(2026, 1, 9, 9, 0, 0)
    tasks["Overdue"].priority = 1
    tasks["Overdue"].updated_at = datetime(2026, 1, 9, 10, 0, 0)
    tasks["Future due"].due_time = datetime(2026, 1, 11, 9, 0, 0)
    tasks["Future due"].priority = 3
    tasks["Future due"].updated_at = datetime(2026, 1, 9, 11, 0, 0)
    tasks["Planned"].planned_date = datetime(2026, 1, 10).date()
    tasks["Planned"].sort_order = 1
    tasks["Planned"].priority = 2
    tasks["Planned"].updated_at = datetime(2026, 1, 9, 12, 0, 0)
    tasks["Inbox high"].sort_order = 0
    tasks["Inbox high"].priority = 5
    tasks["Inbox high"].updated_at = datetime(2026, 1, 9, 13, 0, 0)
    tasks["Inbox low"].sort_order = 0
    tasks["Inbox low"].priority = 4
    tasks["Inbox low"].updated_at = datetime(2026, 1, 9, 14, 0, 0)
    db_session.commit()

    params = {"limit": 2, "now": "2026-01-10T12:00:00"}
    first_page = client.get("/api/v1/tasks", headers=headers, params=params)

    assert first_page.status_code == 200
    first_items = first_page.json()["data"]
    assert isinstance(first_items, list)
    assert [item["title"] for item in first_items] == ["Overdue", "Future due"]

    second_page = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={
            **params,
            "cursor_id": first_items[-1]["id"],
            "cursor_updated_at": first_items[-1]["updated_at"],
        },
    )

    assert second_page.status_code == 200
    second_items = second_page.json()["data"]
    assert [item["title"] for item in second_items] == ["Planned", "Inbox high"]

    third_page = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={
            **params,
            "cursor_id": second_items[-1]["id"],
            "cursor_updated_at": second_items[-1]["updated_at"],
        },
    )

    assert third_page.status_code == 200
    assert [item["title"] for item in third_page.json()["data"]] == ["Inbox low"]


def test_task_list_cursor_pagination_respects_search_ranking(
    client: TestClient, db_session
) -> None:
    headers = auth_headers(client, "cursor-search", "cursor-search@example.com")
    title_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Launch checklist"},
    )
    content_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Release chores", "content": "launch checklist"},
    )
    title_id = title_response.json()["data"]["id"]
    content_id = content_response.json()["data"]["id"]

    title_task = db_session.get(Task, title_id)
    content_task = db_session.get(Task, content_id)
    title_task.updated_at = datetime(2026, 1, 9, 10, 0, 0)
    content_task.updated_at = datetime(2026, 1, 9, 12, 0, 0)
    db_session.commit()

    params = {"q": "launch checklist", "limit": 1, "now": "2026-01-10T12:00:00"}
    first_page = client.get("/api/v1/tasks", headers=headers, params=params)

    assert first_page.status_code == 200
    first_items = first_page.json()["data"]
    assert [item["id"] for item in first_items] == [title_id]

    second_page = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={
            **params,
            "cursor_id": first_items[-1]["id"],
            "cursor_updated_at": first_items[-1]["updated_at"],
        },
    )

    assert second_page.status_code == 200
    assert [item["id"] for item in second_page.json()["data"]] == [content_id]


def test_task_list_rejects_ambiguous_cursor_requests(client: TestClient) -> None:
    headers = auth_headers(client, "cursor-guard", "cursor-guard@example.com")
    create_response = client.post("/api/v1/tasks", headers=headers, json={"title": "Cursor guard"})
    task = create_response.json()["data"]

    missing_timestamp = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"cursor_id": task["id"]},
    )
    assert missing_timestamp.status_code == 400
    assert missing_timestamp.json() == {
        "code": 400,
        "message": "cursor_id and cursor_updated_at must be provided together",
        "data": None,
    }

    mixed_pagination = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={
            "cursor_id": task["id"],
            "cursor_updated_at": task["updated_at"],
            "offset": 1,
        },
    )
    assert mixed_pagination.status_code == 400
    assert mixed_pagination.json() == {
        "code": 400,
        "message": "offset cannot be combined with cursor pagination",
        "data": None,
    }
