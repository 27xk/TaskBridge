from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.core.task_clock import advance_task_clock
from app.models.task import Task
from app.services.sync_log_service import append_sync_log
from app.services.tasks.serialization import task_snapshot


def create_next_occurrence(db: Session, user_id: int, task: Task) -> Task:
    existing = find_existing_repeat_occurrence(db, user_id, task)
    if _repeat_delta(task.repeat_rule) is None:
        raise AppException(status_code=400, message="unsupported repeat_rule")
    if existing is not None:
        db.commit()
        db.refresh(existing)
        return existing
    next_task = build_repeat_occurrence(task, user_id)
    assert next_task is not None
    db.add(next_task)
    db.flush()
    append_sync_log(
        db,
        user_id=user_id,
        task_id=next_task.id,
        operation="repeat_created",
        version=next_task.version,
        payload={**task_snapshot(next_task), "source_task_id": task.id},
    )
    db.commit()
    db.refresh(next_task)
    return next_task


def create_repeat_occurrence_if_needed(db: Session, user_id: int, task: Task) -> Task | None:
    if not task.repeat_rule:
        return None
    if find_existing_repeat_occurrence(db, user_id, task) is not None:
        return None

    next_task = build_repeat_occurrence(task, user_id)
    if next_task is None:
        return None
    db.add(next_task)
    db.flush()
    append_sync_log(
        db,
        user_id=user_id,
        task_id=next_task.id,
        operation="repeat_created",
        version=next_task.version,
        payload={**task_snapshot(next_task), "source_task_id": task.id},
    )
    return next_task


def find_existing_repeat_occurrence(db: Session, user_id: int, task: Task) -> Task | None:
    # Keep lock order consistent with task flushes: owner first, then task.
    advance_task_clock(db, user_id)
    db.flush()
    # Serialize all generators on the parent, including SQLite where FOR UPDATE
    # is ignored. Keep the timestamp unchanged: acquiring a lock is not an edit.
    db.execute(
        update(Task)
        .where(Task.id == task.id, Task.user_id == user_id)
        .values(updated_at=Task.updated_at)
        .execution_options(synchronize_session=False),
    )
    db.scalar(
        select(Task)
        .where(Task.id == task.id, Task.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True),
    )
    # A locking read also sees children committed after a MySQL repeatable-read
    # transaction started (for example during sync's initial context preload).
    return db.scalar(
        select(Task)
        .where(
            Task.user_id == user_id,
            Task.parent_task_id == task.id,
            Task.is_deleted.is_(False),
        )
        .order_by(Task.id.asc())
        .limit(1)
        .with_for_update(),
    )


def build_repeat_occurrence(task: Task, user_id: int) -> Task | None:
    delta = _repeat_delta(task.repeat_rule)
    if delta is None:
        return None
    return Task(
        user_id=user_id,
        title=task.title,
        content=task.content,
        status="todo",
        priority=task.priority,
        tag=task.tag,
        project=task.project,
        list_type=task.list_type,
        due_time=_shift_datetime(task.due_time, delta),
        remind_time=_shift_datetime(task.remind_time, delta),
        repeat_rule=task.repeat_rule,
        planned_date=_shift_date(task.planned_date, delta),
        parent_task_id=task.id,
        checklist=reset_checklist(task.checklist or []),
        is_template=False,
        template_name=None,
        sort_order=task.sort_order,
    )


def _repeat_delta(repeat_rule: str | None) -> timedelta | str | None:
    if repeat_rule is None:
        return None
    normalized = repeat_rule.strip().lower()
    if normalized in {"daily", "every_day", "every day"}:
        return timedelta(days=1)
    if normalized in {"weekly", "every_week", "every week"}:
        return timedelta(days=7)
    if normalized in {"monthly", "every_month", "every month"}:
        return "monthly"
    return None


def _shift_datetime(value: datetime | None, delta: timedelta | str) -> datetime | None:
    if value is None:
        return None
    if delta == "monthly":
        return _add_month(value)
    return value + delta


def _shift_date(value: date | None, delta: timedelta | str) -> date | None:
    if value is None:
        return None
    if delta == "monthly":
        shifted = _add_month(datetime.combine(value, datetime.min.time()))
        return shifted.date()
    return value + delta


def _add_month(value: datetime) -> datetime:
    month = value.month + 1
    year = value.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    day = min(value.day, _last_day_of_month(year, month))
    return value.replace(year=year, month=month, day=day)


def reset_checklist(checklist: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**item, "done": False} for item in deepcopy(checklist)]


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    first_next_month = date(year, month + 1, 1)
    return (first_next_month - timedelta(days=1)).day
