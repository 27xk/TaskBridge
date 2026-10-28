from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Event

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.core import task_clock
from app.core.database import Base
from app.core.observability import render_prometheus_metrics
from app.models.task import Task
from app.models.user import User
from app.schemas.sync import SyncChange, SyncPushRequest
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import sync_service, task_service
from app.utils.time import normalize_to_utc_naive
from tests.conftest import auth_headers, register_test_device


def owner_and_task(db):
    owner = User(username="write-race", email="write-race@example.com", password_hash="unused")
    db.add(owner)
    db.commit()
    task = task_service.create_task(db, owner, TaskCreate(title="Original"))
    return owner, task


def test_stale_orm_task_cannot_overwrite_a_committed_version(db_session):
    owner, task = owner_and_task(db_session)
    with Session(db_session.bind, expire_on_commit=False) as stale:
        stale_task = stale.get(Task, task.id)
        task_service.update_task(db_session, owner, task.id, TaskUpdate(title="Winner"))
        stale_task.title = "Lost update"
        stale_task.version += 1
        with pytest.raises(StaleDataError):
            stale.commit()
    db_session.expire_all()
    assert db_session.get(Task, task.id).title == "Winner"


def test_sync_retries_a_racing_flush_and_returns_the_current_conflict(db_session, monkeypatch):
    owner, task = owner_and_task(db_session)
    original_prepare = sync_service._prepare_push_context
    raced = False

    def prepare_then_compete(*args, **kwargs):
        nonlocal raced
        context = original_prepare(*args, **kwargs)
        if not raced:
            raced = True
            with Session(db_session.bind) as other:
                task_service.update_task(
                    other, other.get(User, owner.id), task.id, TaskUpdate(title="Concurrent winner")
                )
        return context

    monkeypatch.setattr(sync_service, "_prepare_push_context", prepare_then_compete)
    response, notifications = sync_service.push_changes(
        db_session,
        owner,
        SyncPushRequest(
            device_id="racing-device",
            changes=[
                SyncChange(
                    local_id="racing-edit",
                    server_id=task.id,
                    action="update",
                    title="Lost update",
                    version=1,
                    local_updated_at=datetime(2026, 5, 20),
                )
            ],
        ),
    )
    assert response.results[0].status == "conflict"
    assert response.results[0].server_task.title == "Concurrent winner"
    assert notifications == []


def test_late_flush_gets_a_timestamp_after_the_last_pull_watermark(db_session):
    owner, task = owner_and_task(db_session)
    # The edit began before pull but has not flushed/committed yet. Its old
    # application timestamp must never place it before the returned watermark.
    edit_started_at = task.updated_at
    first = sync_service.pull_changes(db_session, owner, datetime(1970, 1, 1))
    watermark = normalize_to_utc_naive(datetime.fromisoformat(first.server_time))
    task.title = "Late commit"
    task.version += 1
    task.updated_at = edit_started_at
    db_session.commit()
    second = sync_service.pull_changes(db_session, owner, watermark)
    assert [item.id for item in second.changed_tasks] == [task.id]
    assert second.changed_tasks[0].updated_at > watermark


def test_pull_clock_remains_monotonic_across_clock_rollback(db_session, monkeypatch):
    owner, task = owner_and_task(db_session)
    first = sync_service.pull_changes(db_session, owner, datetime(1970, 1, 1))
    watermark = normalize_to_utc_naive(datetime.fromisoformat(first.server_time))
    monkeypatch.setattr(sync_service, "utc_now", lambda: watermark - timedelta(days=1))
    monkeypatch.setattr(task_service, "utc_now", lambda: watermark - timedelta(days=1))
    monkeypatch.setattr(task_clock, "utc_now", lambda: watermark - timedelta(days=1))
    task_service.update_task(db_session, owner, task.id, TaskUpdate(title="Clock rollback"))
    second = sync_service.pull_changes(db_session, owner, watermark)
    assert [item.id for item in second.changed_tasks] == [task.id]
    assert normalize_to_utc_naive(datetime.fromisoformat(second.server_time)) > watermark


def test_sync_metrics_report_bounded_results_and_duration(db_session):
    owner, _task = owner_and_task(db_session)
    sync_service.pull_changes(db_session, owner, datetime(1970, 1, 1))
    metrics = render_prometheus_metrics()
    assert 'taskbridge_sync_operations_total{direction="pull",outcome="success"}' in metrics
    assert 'taskbridge_sync_items_total{direction="pull",result="changed"}' in metrics
    assert 'taskbridge_sync_duration_ms_bucket{direction="pull",le="+Inf"}' in metrics


def test_pull_waits_for_a_writer_that_flushed_before_its_commit(tmp_path):
    engine = create_engine(
        f"sqlite+pysqlite:///{(tmp_path / 'watermark.db').as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    with Session(engine) as seed:
        owner, task = owner_and_task(seed)
        owner_id, task_id = owner.id, task.id
    flushed, release, pull_started, pull_finished = Event(), Event(), Event(), Event()

    def hold_flushed_write(_db, _context):
        flushed.set()
        assert release.wait(5), "writer did not get released"

    def write():
        with Session(engine) as writer:
            event.listen(writer, "after_flush_postexec", hold_flushed_write, once=True)
            return task_service.update_task(
                writer, writer.get(User, owner_id), task_id, TaskUpdate(title="Late transaction")
            ).title

    def pull():
        with Session(engine) as reader:
            current_owner = reader.get(User, owner_id)
            pull_started.set()
            response = sync_service.pull_changes(reader, current_owner, datetime(1970, 1, 1))
            pull_finished.set()
            return response

    try:
        with ThreadPoolExecutor(max_workers=2) as workers:
            writer = workers.submit(write)
            assert flushed.wait(5), "writer did not flush"
            reader = workers.submit(pull)
            try:
                assert pull_started.wait(5), "pull did not start"
                assert not pull_finished.wait(0.1), "pull advanced past an uncommitted write"
            finally:
                release.set()
            assert writer.result(timeout=10) == "Late transaction"
            assert reader.result(timeout=10).changed_tasks[0].title == "Late transaction"
    finally:
        release.set()
        engine.dispose()


def test_rest_racing_write_returns_a_version_conflict(client, db_session, monkeypatch):
    headers = auth_headers(client, "rest-race", "rest-race@example.com")
    task = client.post("/api/v1/tasks", headers=headers, json={"title": "Original"}).json()["data"]
    original_get = task_service._get_owned_task

    def get_then_compete(*args, **kwargs):
        loaded = original_get(*args, **kwargs)
        with Session(db_session.bind) as other:
            winner = other.get(Task, loaded.id)
            winner.title = "Committed winner"
            winner.version += 1
            other.commit()
        return loaded

    monkeypatch.setattr(task_service, "_get_owned_task", get_then_compete)
    response = client.put(
        f"/api/v1/tasks/{task['id']}",
        headers=headers,
        json={"title": "Losing write", "expected_version": 1},
    )
    assert response.status_code == 409
    assert response.json()["message"] == "version conflict"
    db_session.rollback()
    assert db_session.get(Task, task["id"]).title == "Committed winner"


def test_sync_push_does_not_execute_sql_on_event_loop(client, db_session):
    import asyncio

    headers = auth_headers(client, "threaded-sync", "threaded-sync@example.com")
    register_test_device(client, headers, "sync-worker")
    queries_on_event_loop = []

    def capture_query(*_args):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            queries_on_event_loop.append(False)
        else:
            queries_on_event_loop.append(True)

    event.listen(db_session.bind, "before_cursor_execute", capture_query)
    try:
        response = client.post(
            "/api/v1/sync/push",
            headers=headers,
            json={
                "device_id": "sync-worker",
                "changes": [
                    {
                        "local_id": "worker-create",
                        "action": "create",
                        "title": "Worker thread",
                        "version": 0,
                        "local_updated_at": "2026-05-20T00:00:00Z",
                    }
                ],
            },
        )
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_query)
    assert response.status_code == 200
    assert queries_on_event_loop
    assert not any(queries_on_event_loop)


def test_repeat_generation_refreshes_a_cached_parent_under_its_lock(db_session):
    owner, task = owner_and_task(db_session)
    task.repeat_rule = "daily"
    db_session.commit()
    # An earlier query in this Session must not freeze the repeat template.
    assert task.title == "Original"
    with Session(db_session.bind) as other:
        task_service.update_task(
            other, other.get(User, owner.id), task.id, TaskUpdate(title="Latest repeat template")
        )
    child = task_service.create_next_occurrence(db_session, owner, task.id)
    assert child.title == "Latest repeat template"
