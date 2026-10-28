import pytest
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate
from app.services import task_service
from app.services.websocket_manager import websocket_manager
from tests.conftest import auth_headers


@pytest.fixture()
def committed_events(monkeypatch):
    events = []
    monkeypatch.setattr(
        websocket_manager, "submit_committed", lambda *event: events.append(event), raising=False
    )
    return events


def test_all_rest_task_changes_publish_after_commit_and_exclude_the_actor(client, committed_events):
    headers = auth_headers(client, "notify-owner", "notify-owner@example.com", "actor-device")
    created = client.post("/api/v1/tasks", headers=headers, json={"title": "Create"})
    task = created.json()["data"]
    assert len(committed_events) == 1
    user_id, excluded, notification = committed_events[0]
    assert excluded == "actor-device"
    assert notification["action"] == "created"
    assert notification["task_id"] == task["id"]
    response = client.post(
        "/api/v1/tasks/batch",
        headers=headers,
        json={"task_ids": [task["id"]], "action": "complete"},
    )
    assert response.status_code == 200
    assert len(committed_events) == 2
    assert committed_events[-1][2]["action"] == "completed"
    assert committed_events[-1][2]["version"] == 2
    response = client.post(
        "/api/v1/tasks/import", headers=headers, json={"tasks": [{"title": "Imported"}]}
    )
    assert response.status_code == 200
    assert len(committed_events) == 3
    assert committed_events[-1][0] == user_id


def test_task_flush_and_rollback_never_publish(db_session, committed_events):
    owner = User(username="rollback-owner", email="rollback-owner@example.com", password_hash="x")
    db_session.add(owner)
    db_session.commit()
    db_session.add(Task(user_id=owner.id, title="Rolled back"))
    db_session.flush()
    assert committed_events == []
    db_session.rollback()
    db_session.commit()
    assert committed_events == []


def test_savepoint_commit_does_not_publish_before_outer_commit(db_session, committed_events):
    owner = User(username="savepoint-owner", email="savepoint-owner@example.com", password_hash="x")
    db_session.add(owner)
    db_session.commit()
    with db_session.begin_nested():
        db_session.add(Task(user_id=owner.id, title="Nested task"))
        db_session.flush()
    assert committed_events == []
    db_session.commit()
    assert len(committed_events) == 1


def test_savepoint_rollback_discards_only_nested_notifications(db_session, committed_events):
    owner = User(username="nested-rollback", email="nested-rollback@example.com", password_hash="x")
    db_session.add(owner)
    db_session.commit()
    db_session.add(Task(user_id=owner.id, title="Outer task"))
    db_session.flush()
    with pytest.raises(ValueError), db_session.begin_nested():
        db_session.add(Task(user_id=owner.id, title="Rolled back nested task"))
        db_session.flush()
        raise ValueError("rollback savepoint")
    db_session.commit()
    assert len(committed_events) == 1


def test_subscriber_failure_does_not_turn_a_committed_write_into_a_failure(db_session, monkeypatch):
    owner = User(username="failure-owner", email="failure-owner@example.com", password_hash="x")
    db_session.add(owner)
    db_session.commit()

    def unavailable(*_args):
        raise RuntimeError("notification unavailable")

    monkeypatch.setattr(websocket_manager, "submit_committed", unavailable, raising=False)
    task = task_service.create_task(db_session, owner, TaskCreate(title="Durably saved"))
    with Session(db_session.bind) as other:
        assert other.get(Task, task.id).title == "Durably saved"


def test_closing_an_uncommitted_session_does_not_leak_events_on_reuse(db_session, committed_events):
    owner = User(username="closed-owner", email="closed-owner@example.com", password_hash="x")
    db_session.add(owner)
    db_session.commit()
    db_session.add(Task(user_id=owner.id, title="Closed without commit"))
    db_session.flush()
    db_session.close()
    db_session.commit()
    assert committed_events == []
