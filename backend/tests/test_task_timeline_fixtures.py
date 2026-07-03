import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.user import User
from tests.conftest import auth_headers

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "task-timeline-fixtures.json"


def test_task_list_matches_shared_timeline_fixture(
    client: TestClient,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "shared-timeline", "shared-timeline@example.com")
    timeline = _load_timeline_fixture()
    _seed_timeline_tasks(db_session, "shared-timeline", timeline["tasks"])

    response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"now": timeline["now"], "limit": 100},
    )

    assert response.status_code == 200
    assert [item["title"] for item in response.json()["data"]] == timeline["expectedOrder"]

    meta_response = client.get("/api/v1/tasks/meta", headers=headers)
    assert meta_response.status_code == 200
    meta_counts = meta_response.json()["data"]["counts"]
    assert meta_counts["open"] == 8
    assert meta_counts["completed"] == 4


def test_task_cursor_pagination_matches_shared_timeline_fixture(
    client: TestClient,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "shared-timeline-cursor", "shared-cursor@example.com")
    timeline = _load_timeline_fixture()
    _seed_timeline_tasks(db_session, "shared-timeline-cursor", timeline["tasks"])

    seen_titles: list[str] = []
    params: dict[str, Any] = {"now": timeline["now"], "limit": 3}
    while True:
        response = client.get("/api/v1/tasks", headers=headers, params=params)
        assert response.status_code == 200
        page = response.json()["data"]
        if not page:
            break
        seen_titles.extend(item["title"] for item in page)
        if len(page) < params["limit"]:
            break
        params = {
            **params,
            "cursor_id": page[-1]["id"],
            "cursor_updated_at": page[-1]["updated_at"],
        }

    assert seen_titles == timeline["expectedOrder"]


def test_today_view_excludes_completed_tasks_from_shared_timeline_fixture(
    client: TestClient,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "shared-timeline-today", "shared-today@example.com")
    timeline = _load_timeline_fixture()
    _seed_timeline_tasks(db_session, "shared-timeline-today", timeline["tasks"])

    response = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"view": "today", "now": timeline["now"], "limit": 100},
    )

    assert response.status_code == 200
    assert [item["title"] for item in response.json()["data"]] == [
        "overdue-early",
        "overdue-late",
        "upcoming-sooner",
        "planned-low-sort",
        "planned-high-sort",
    ]


def _load_timeline_fixture() -> dict[str, Any]:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return payload["timeline"]


def _seed_timeline_tasks(
    db_session: Session,
    username: str,
    items: list[dict[str, Any]],
) -> None:
    user = db_session.scalar(select(User).where(User.username == username))
    assert user is not None
    db_session.add_all(
        [
            Task(
                user_id=user.id,
                title=item["id"],
                status=item.get("status", "todo"),
                priority=item.get("priority", 0),
                list_type=item.get("list_type", "inbox"),
                due_time=_parse_datetime(item.get("due_time")),
                planned_date=_parse_date(item.get("planned_date")),
                completed_at=_parse_datetime(item.get("completed_at")),
                sort_order=item.get("sort_order", 0),
                created_at=_parse_datetime(item.get("created_at")) or datetime(2026, 5, 1),
                updated_at=_parse_datetime(item.get("updated_at")) or datetime(2026, 5, 1),
            )
            for item in items
        ],
    )
    db_session.commit()


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(UTC).replace(tzinfo=None)


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None
