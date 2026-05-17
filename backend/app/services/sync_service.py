from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.sync_log import SyncLog
from app.models.user import User
from app.repositories.sync_repository import get_owned_task, list_changed_tasks
from app.schemas.sync import (
    SyncChange,
    SyncChangeResult,
    SyncNotification,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
)
from app.schemas.task import TaskRead
from app.utils.time import normalize_to_utc_naive, utc_iso, utc_now


def shift_repeat_task(task: Task) -> Task | None:
    from app.services.task_service import _build_repeat_occurrence

    return _build_repeat_occurrence(task, task.user_id)

TASK_SYNC_FIELDS = (
    "title",
    "content",
    "status",
    "priority",
    "tag",
    "project",
    "list_type",
    "due_time",
    "remind_time",
    "repeat_rule",
    "planned_date",
    "completed_at",
    "snoozed_until",
    "parent_task_id",
    "checklist",
    "is_template",
    "template_name",
    "sort_order",
)

NOTIFICATION_ACTIONS = {
    "create": "created",
    "update": "updated",
    "delete": "deleted",
    "complete": "completed",
    "restore": "restored",
}


def append_sync_log(
    db: Session,
    *,
    user_id: int,
    task_id: int | None,
    operation: str | None = None,
    action: str | None = None,
    version: int,
    device_id: str | None = None,
    local_id: str | None = None,
    server_id: int | None = None,
    result: str = "applied",
    client_version: int | None = None,
    payload: dict | None = None,
) -> SyncLog:
    sync_log = SyncLog(
        user_id=user_id,
        task_id=task_id,
        device_id=device_id,
        local_id=local_id,
        server_id=server_id,
        action=action or operation or "unknown",
        result=result,
        client_version=client_version,
        version=version,
        payload=payload,
    )
    db.add(sync_log)
    return sync_log


def pull_changes(db: Session, current_user: User, last_sync_time: datetime) -> SyncPullResponse:
    since = normalize_to_utc_naive(last_sync_time)
    changed_tasks = list_changed_tasks(
        db,
        user_id=current_user.id,
        since=since,
        is_deleted=False,
    )
    deleted_tasks = list_changed_tasks(
        db,
        user_id=current_user.id,
        since=since,
        is_deleted=True,
    )
    return SyncPullResponse(
        changed_tasks=[TaskRead.model_validate(task) for task in changed_tasks],
        deleted_tasks=[TaskRead.model_validate(task) for task in deleted_tasks],
        server_time=utc_iso(),
    )


def push_changes(
    db: Session,
    current_user: User,
    payload: SyncPushRequest,
) -> tuple[SyncPushResponse, list[SyncNotification]]:
    results: list[SyncChangeResult] = []
    notifications: list[SyncNotification] = []
    server_now = utc_now()
    server_time = utc_iso(server_now)

    for change in payload.changes:
        result, notification = _apply_change(
            db,
            current_user,
            payload.device_id,
            change,
            server_now,
        )
        results.append(result)
        if notification is not None:
            notifications.append(notification)

    db.commit()
    return SyncPushResponse(results=results, server_time=server_time), notifications


def _apply_change(
    db: Session,
    current_user: User,
    device_id: str,
    change: SyncChange,
    server_now: datetime,
) -> tuple[SyncChangeResult, SyncNotification | None]:
    if change.action == "create":
        return _create_from_change(db, current_user, device_id, change, server_now)

    if change.server_id is None:
        return (
            SyncChangeResult(
                local_id=change.local_id,
                server_id=None,
                action=change.action,
                status="failed",
                message="server_id is required",
            ),
            None,
        )

    task = get_owned_task(
        db,
        user_id=current_user.id,
        task_id=change.server_id,
        include_deleted=True,
    )
    if task is None:
        return (
            SyncChangeResult(
                local_id=change.local_id,
                server_id=change.server_id,
                action=change.action,
                status="failed",
                message="task not found",
            ),
            None,
        )

    if change.version < task.version:
        return (
            SyncChangeResult(
                local_id=change.local_id,
                server_id=task.id,
                action=change.action,
                status="conflict",
                version=task.version,
                message="version conflict",
                server_task=TaskRead.model_validate(task),
            ),
            None,
        )

    if change.action == "update":
        _apply_update_fields(task, change)
    elif change.action == "delete":
        task.is_deleted = True
        task.deleted_at = server_now
    elif change.action == "complete":
        task.status = "completed"
        task.completed_at = server_now
    elif change.action == "restore":
        task.is_deleted = False
        task.deleted_at = None
        task.status = change.status or "todo"
        task.completed_at = None

    task.version += 1
    task.updated_at = server_now
    db.add(task)
    db.flush()
    _append_success_log(db, current_user.id, device_id, change, task)
    if change.action == "complete":
        _create_repeat_from_sync(db, current_user.id, task)
    task_read = TaskRead.model_validate(task)
    return (
        SyncChangeResult(
            local_id=change.local_id,
            server_id=task.id,
            action=change.action,
            status="applied",
            version=task.version,
            task=task_read,
        ),
        _notification_for(change.action, task, server_now),
    )


def _create_repeat_from_sync(db: Session, user_id: int, task: Task) -> Task | None:
    if not task.repeat_rule:
        return None
    existing_id = db.scalar(
        select(Task.id).where(
            Task.user_id == user_id,
            Task.parent_task_id == task.id,
            Task.is_deleted.is_(False),
        ),
    )
    if existing_id is not None:
        return None
    next_task = shift_repeat_task(task)
    if next_task is None:
        return None
    db.add(next_task)
    db.flush()
    append_sync_log(
        db,
        user_id=user_id,
        task_id=next_task.id,
        action="repeat_created",
        version=next_task.version,
        payload=_task_payload(next_task) | {"source_task_id": task.id},
    )
    return next_task


def _create_from_change(
    db: Session,
    current_user: User,
    device_id: str,
    change: SyncChange,
    server_now: datetime,
) -> tuple[SyncChangeResult, SyncNotification | None]:
    title = _clean_title(change.title)
    if title is None:
        return (
            SyncChangeResult(
                local_id=change.local_id,
                server_id=None,
                action=change.action,
                status="failed",
                message="title is required",
            ),
            None,
        )

    task = Task(
        user_id=current_user.id,
        title=title,
        content=change.content,
        status=change.status or "todo",
        priority=change.priority if change.priority is not None else 0,
        tag=change.tag,
        project=change.project,
        list_type=change.list_type or "inbox",
        due_time=normalize_to_utc_naive(change.due_time) if change.due_time else None,
        remind_time=normalize_to_utc_naive(change.remind_time) if change.remind_time else None,
        repeat_rule=change.repeat_rule,
        planned_date=_normalize_date(change.planned_date),
        completed_at=normalize_to_utc_naive(change.completed_at) if change.completed_at else None,
        snoozed_until=normalize_to_utc_naive(change.snoozed_until) if change.snoozed_until else None,
        parent_task_id=change.parent_task_id,
        checklist=_normalize_checklist(change.checklist),
        is_template=change.is_template or False,
        template_name=change.template_name,
        sort_order=change.sort_order or 0,
        version=1,
        is_deleted=False,
        created_at=server_now,
        updated_at=server_now,
    )
    db.add(task)
    db.flush()
    _append_success_log(db, current_user.id, device_id, change, task)
    task_read = TaskRead.model_validate(task)
    return (
        SyncChangeResult(
            local_id=change.local_id,
            server_id=task.id,
            action=change.action,
            status="applied",
            version=task.version,
            task=task_read,
        ),
        _notification_for(change.action, task, server_now),
    )


def _apply_update_fields(task: Task, change: SyncChange) -> None:
    field_names = set(change.model_fields_set)
    for field in TASK_SYNC_FIELDS:
        if field not in field_names:
            continue
        value = getattr(change, field)
        if field in {"due_time", "remind_time"} and value is not None:
            value = normalize_to_utc_naive(value)
        elif field in {"completed_at", "snoozed_until"} and value is not None:
            value = normalize_to_utc_naive(value)
        elif field == "planned_date" and value is not None:
            value = _normalize_date(value)
        elif field == "title" and value is not None:
            value = value.strip()
        elif field == "checklist" and value is not None:
            value = _normalize_checklist(value)
        setattr(task, field, value)


def _clean_title(title: str | None) -> str | None:
    if title is None:
        return None
    stripped = title.strip()
    return stripped or None


def _append_success_log(
    db: Session,
    user_id: int,
    device_id: str,
    change: SyncChange,
    task: Task,
) -> None:
    append_sync_log(
        db,
        user_id=user_id,
        task_id=task.id,
        action=change.action,
        device_id=device_id,
        local_id=change.local_id,
        server_id=task.id,
        result="applied",
        client_version=change.version,
        version=task.version,
        payload=_task_payload(task),
    )


def _task_payload(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "version": task.version,
        "is_deleted": task.is_deleted,
        "updated_at": utc_iso(task.updated_at),
        "project": task.project,
        "list_type": task.list_type,
        "planned_date": task.planned_date.isoformat() if task.planned_date else None,
        "completed_at": utc_iso(task.completed_at) if task.completed_at else None,
        "snoozed_until": utc_iso(task.snoozed_until) if task.snoozed_until else None,
        "checklist": task.checklist or [],
    }


def _notification_for(action: str, task: Task, server_now: datetime) -> SyncNotification:
    return SyncNotification(
        action=NOTIFICATION_ACTIONS[action],
        task_id=task.id,
        version=task.version,
        server_time=utc_iso(server_now),
    )


def _normalize_date(value: date | datetime | str | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return value.date()


def _normalize_checklist(value: Any) -> list[dict[str, Any]]:
    if not value:
        return []
    normalized: list[dict[str, Any]] = []
    for item in value:
        if hasattr(item, "model_dump"):
            normalized.append(item.model_dump())
        elif isinstance(item, dict):
            normalized.append(item)
    return normalized
