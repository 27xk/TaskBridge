import csv
import io
from datetime import date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.user import User
from app.services.task_service import get_task_meta
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
    client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Pinned today",
            "project": "work",
            "tag": "plan",
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
    assert meta["counts"]["open"] == 3
    assert meta["counts"]["today"] == 3
    assert meta["counts"]["overdue"] == 1

    export_response = client.get("/api/v1/tasks/export", headers=headers)
    assert export_response.status_code == 200
    exported = export_response.json()["data"]
    assert exported["format"] == "json"
    assert {task["title"] for task in exported["tasks"]} == {"Overdue invoice", "Today planning", "Pinned today"}

    csv_response = client.get("/api/v1/tasks/export", headers=headers, params={"format": "csv"})
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "Overdue invoice" in csv_response.text


def test_task_meta_uses_single_aggregate_count_query(db_session: Session) -> None:
    user = User(
        username="meta-aggregate-user",
        email="meta-aggregate@example.com",
        password_hash="hash",
    )
    db_session.add(user)
    db_session.flush()
    db_session.add_all(
        [
            Task(user_id=user.id, title="Open inbox", status="todo", list_type="inbox"),
            Task(user_id=user.id, title="Template", status="todo", list_type="template", is_template=True),
            Task(user_id=user.id, title="Done", status="completed"),
            Task(user_id=user.id, title="Done alias", status="done"),
            Task(user_id=user.id, title="Trash", status="todo", is_deleted=True),
        ],
    )
    db_session.commit()

    statements: list[str] = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        statements.append(statement)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", record_sql)
    try:
        meta = get_task_meta(db_session, user)
    finally:
        event.remove(bind, "before_cursor_execute", record_sql)

    assert meta["counts"]["open"] == 2
    assert meta["counts"]["completed"] == 2
    assert meta["counts"]["inbox"] == 1
    assert meta["counts"]["templates"] == 1
    assert meta["counts"]["trash"] == 1
    aggregate_count_queries = [
        statement
        for statement in statements
        if "sum(" in statement.lower()
    ]
    assert len(aggregate_count_queries) == 1
    assert all("count(" not in statement.lower() for statement in statements)


def test_task_list_uses_timeline_order_and_today_includes_overdue(
    client: TestClient,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "timeline-user", "timeline@example.com")
    user = db_session.scalar(select(User).where(User.username == "timeline-user"))
    assert user is not None

    created_at = datetime(2026, 5, 19, 0, 0, 0)
    tasks = [
        Task(
            user_id=user.id,
            title="completed newest",
            status="completed",
            due_time=datetime(2026, 5, 18, 9, 0, 0),
            completed_at=datetime(2026, 5, 20, 7, 30, 0),
            updated_at=datetime(2026, 5, 20, 7, 30, 0),
            created_at=created_at,
        ),
        Task(
            user_id=user.id,
            title="planned today",
            status="todo",
            planned_date=date(2026, 5, 20),
            updated_at=datetime(2026, 5, 20, 7, 0, 0),
            created_at=created_at,
        ),
        Task(
            user_id=user.id,
            title="today list without planned date",
            status="todo",
            list_type="today",
            updated_at=datetime(2026, 5, 20, 7, 0, 0),
            created_at=created_at,
        ),
        Task(
            user_id=user.id,
            title="upcoming later today",
            status="todo",
            due_time=datetime(2026, 5, 20, 9, 0, 0),
            updated_at=datetime(2026, 5, 20, 7, 0, 0),
            created_at=created_at,
        ),
        Task(
            user_id=user.id,
            title="overdue yesterday",
            status="todo",
            due_time=datetime(2026, 5, 19, 10, 0, 0),
            updated_at=datetime(2026, 5, 20, 7, 0, 0),
            created_at=created_at,
        ),
    ]
    db_session.add_all(tasks)
    db_session.commit()

    list_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"now": "2026-05-20T08:00:00Z"},
    )
    assert list_response.status_code == 200
    assert [item["title"] for item in list_response.json()["data"]] == [
        "overdue yesterday",
        "upcoming later today",
        "planned today",
        "today list without planned date",
        "completed newest",
    ]

    today_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"view": "today", "now": "2026-05-20T08:00:00Z"},
    )
    assert today_response.status_code == 200
    assert [item["title"] for item in today_response.json()["data"]] == [
        "overdue yesterday",
        "upcoming later today",
        "planned today",
        "today list without planned date",
    ]


def test_task_list_rejects_unknown_view(client: TestClient) -> None:
    headers = auth_headers(client, "unknown-view", "unknown-view@example.com")

    response = client.get("/api/v1/tasks", headers=headers, params={"view": "conflict"})

    assert response.status_code == 422


def test_today_view_uses_requested_iana_timezone(client: TestClient) -> None:
    headers = auth_headers(client, "timezone-view", "timezone-view@example.com")
    for title, planned_date in (
        ("Shanghai today", "2026-05-20"),
        ("Los Angeles today", "2026-05-19"),
    ):
        response = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"title": title, "planned_date": planned_date},
        )
        assert response.status_code == 201

    shanghai_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={
            "view": "today",
            "now": "2026-05-20T01:00:00Z",
            "timezone": "Asia/Shanghai",
        },
    )
    los_angeles_response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={
            "view": "today",
            "now": "2026-05-20T01:00:00Z",
            "timezone": "America/Los_Angeles",
        },
    )

    assert shanghai_response.status_code == 200
    assert [task["title"] for task in shanghai_response.json()["data"]] == ["Shanghai today"]
    assert los_angeles_response.status_code == 200
    assert [task["title"] for task in los_angeles_response.json()["data"]] == [
        "Los Angeles today"
    ]


def test_task_list_rejects_unknown_timezone(client: TestClient) -> None:
    headers = auth_headers(client, "unknown-timezone", "unknown-timezone@example.com")

    response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"view": "today", "timezone": "Mars/Olympus_Mons"},
    )

    assert response.status_code == 400
    assert response.json()["message"] == "invalid timezone"


def test_task_meta_uses_the_same_requested_timezone_as_today_view(client: TestClient) -> None:
    headers = auth_headers(client, "timezone-meta", "timezone-meta@example.com")
    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Los Angeles plan", "planned_date": "2026-05-19"},
    )
    assert create_response.status_code == 201

    shanghai_response = client.get(
        "/api/v1/tasks/meta",
        headers=headers,
        params={"now": "2026-05-20T01:00:00Z", "timezone": "Asia/Shanghai"},
    )
    los_angeles_response = client.get(
        "/api/v1/tasks/meta",
        headers=headers,
        params={"now": "2026-05-20T01:00:00Z", "timezone": "America/Los_Angeles"},
    )

    assert shanghai_response.status_code == 200
    assert shanghai_response.json()["data"]["counts"]["today"] == 0
    assert los_angeles_response.status_code == 200
    assert los_angeles_response.json()["data"]["counts"]["today"] == 1


def test_csv_export_escapes_spreadsheet_formula_values(client: TestClient) -> None:
    headers = auth_headers(client, "csv-user", "csv@example.com")

    create_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": '=HYPERLINK("https://example.test","open")',
            "project": "+project",
            "tag": "-tag",
            "list_type": "@list",
        },
    )
    assert create_response.status_code == 201

    csv_response = client.get("/api/v1/tasks/export", headers=headers, params={"format": "csv"})

    assert csv_response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(csv_response.text)))
    assert rows[0]["title"] == '\'=HYPERLINK("https://example.test","open")'
    assert rows[0]["project"] == "'+project"
    assert rows[0]["tag"] == "'-tag"
    assert rows[0]["list_type"] == "'@list"


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
