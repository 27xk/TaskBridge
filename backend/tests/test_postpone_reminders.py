from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.task_service import get_task_meta
from tests.conftest import auth_headers


@pytest.mark.parametrize("remind_time", [None, "2026-05-17T08:00:00Z", "2026-05-18T08:00:00Z"])
def test_postpone_moves_existing_reminders_with_the_new_due_time(
    client: TestClient,
    db_session: Session,
    remind_time: str | None,
) -> None:
    headers = auth_headers(client, "postpone-timing", "postpone-timing@example.com")
    task = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Postpone a reminder",
            "list_type": "today",
            "planned_date": "2026-05-18",
            "due_time": "2026-05-18T09:00:00Z",
            "remind_time": remind_time,
            "snoozed_until": "2026-05-18T10:00:00Z",
        },
    ).json()["data"]

    response = client.post(
        f"/api/v1/tasks/{task['id']}/postpone",
        headers=headers,
        json={
            "planned_date": "2026-05-19",
            "due_time": "2026-05-19T09:00:00Z",
        },
    )

    assert response.status_code == 200
    postponed = response.json()["data"]
    assert postponed["list_type"] == "inbox"
    assert postponed["snoozed_until"] is None
    if remind_time is None:
        assert postponed["remind_time"] is None
    else:
        assert postponed["remind_time"].startswith("2026-05-19T09:00:00")
    user = db_session.scalar(select(User).where(User.username == "postpone-timing"))
    assert (
        get_task_meta(
            db_session,
            user,
            timezone_name="UTC",
            now=datetime(2026, 5, 18, 7),
        )["counts"]["today"]
        == 0
    )


def test_postpone_honors_an_explicit_replacement_reminder(client: TestClient) -> None:
    headers = auth_headers(client, "postpone-custom", "postpone-custom@example.com")
    task = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Keep a custom reminder",
            "due_time": "2026-05-18T09:00:00Z",
            "remind_time": "2026-05-18T08:00:00Z",
        },
    ).json()["data"]
    response = client.post(
        f"/api/v1/tasks/{task['id']}/postpone",
        headers=headers,
        json={
            "due_time": "2026-05-19T09:00:00Z",
            "remind_time": "2026-05-19T08:45:00Z",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["remind_time"].startswith("2026-05-19T08:45:00")
