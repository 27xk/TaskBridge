from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from threading import Event, Lock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.models.user import User
from app.schemas.sync import SyncChange, SyncPushRequest
from app.services import task_service
from app.services.sync_service import push_changes


@pytest.mark.parametrize("competing_action", ["manual", "complete", "sync"])
def test_concurrent_repeat_requests_create_one_child_and_one_log(
    tmp_path,
    monkeypatch,
    competing_action: str,
) -> None:
    engine = create_engine(
        f"sqlite+pysqlite:///{(tmp_path / 'repeat.db').as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(username="repeat-race", email="repeat-race@example.com", password_hash="unused")
        db.add(user)
        db.flush()
        parent = Task(
            user_id=user.id,
            title="Daily review",
            repeat_rule="daily",
            planned_date=date(2026, 5, 20),
            due_time=datetime(2026, 5, 20, 9),
        )
        db.add(parent)
        db.commit()
        user_id, parent_id = user.id, parent.id
        original_updated_at = parent.updated_at

    first_build_started = Event()
    second_build_started = Event()
    second_request_started = Event()
    release_build = Event()
    build_lock = Lock()
    build_count = 0
    original_build = task_service._build_repeat_occurrence

    def delayed_build(task, owner_id):
        nonlocal build_count
        with build_lock:
            build_count += 1
            (first_build_started if build_count == 1 else second_build_started).set()
        assert release_build.wait(5), "repeat request did not get released"
        return original_build(task, owner_id)

    monkeypatch.setattr(task_service, "_build_repeat_occurrence", delayed_build)

    def request(action, *, second=False):
        with Session(engine, autoflush=False) as db:
            user = db.get(User, user_id)
            if second:
                second_request_started.set()
            if action == "manual":
                return task_service.create_next_occurrence(db, user, parent_id).id
            if action == "complete":
                return task_service.complete_task(db, user, parent_id).id
            response, _ = push_changes(
                db,
                user,
                SyncPushRequest(
                    device_id="repeat-race-device",
                    changes=[
                        SyncChange(
                            local_id="repeat-race-parent",
                            server_id=parent_id,
                            action="complete",
                            version=1,
                            local_updated_at=datetime(2026, 5, 20, 10),
                        )
                    ],
                ),
            )
            assert response.results[0].status == "applied"
            return response.results[0].server_id

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(request, "manual")
            try:
                assert first_build_started.wait(5), "first repeat request did not start"
                second = executor.submit(request, competing_action, second=True)
                assert second_request_started.wait(5), "second repeat request did not start"
                # A correct transaction blocks the second build until the first commits.
                # The unfixed code reaches both builders before either inserts its child.
                second_build_started.wait(1)
            finally:
                release_build.set()
            first_id, second_id = first.result(timeout=10), second.result(timeout=10)

        with Session(engine) as db:
            children = list(db.scalars(select(Task).where(Task.parent_task_id == parent_id)))
            repeat_logs = list(
                db.scalars(select(SyncLog).where(SyncLog.action == "repeat_created"))
            )
            assert len(children) == 1
            assert len(repeat_logs) == 1
            assert children[0].id == first_id
            assert children[0].planned_date == date(2026, 5, 21)
            if competing_action == "manual":
                assert first_id == second_id
                assert db.get(Task, parent_id).updated_at == original_updated_at
    finally:
        engine.dispose()
