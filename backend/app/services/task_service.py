from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.exceptions import AppException
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.models.user import User
from app.schemas.task import (
    ChecklistItem,
    ChecklistItemUpdate,
    TaskBatchRequest,
    TaskConflictResolveRequest,
    TaskCreate,
    TaskHistoryRead,
    TaskImportItem,
    TaskImportRequest,
    TaskPlanRequest,
    TaskPostponeRequest,
    TaskSnoozeRequest,
    TaskTemplateInstantiateRequest,
    TaskUpdate,
)
from app.services.sync_service import append_sync_log
from app.utils.time import (
    normalize_to_utc_naive,
    shanghai_day_utc_bounds,
    shanghai_local_date,
    utc_now,
)

COMPLETED_STATUSES = ("completed", "done")


def _get_owned_task(
    db: Session,
    current_user: User,
    task_id: int,
    include_deleted: bool = False,
) -> Task:
    conditions = [Task.id == task_id, Task.user_id == current_user.id]
    if not include_deleted:
        conditions.append(Task.is_deleted.is_(False))

    task = db.scalar(select(Task).where(*conditions))
    if task is None:
        raise AppException(status_code=404, message="task not found")
    return task


def _ensure_owned_parent_task(
    db: Session,
    current_user: User,
    parent_task_id: int | None,
    *,
    child_task_id: int | None = None,
) -> None:
    if parent_task_id is None:
        return
    if child_task_id is not None and parent_task_id == child_task_id:
        raise AppException(status_code=400, message="parent task cannot be self")
    parent_id = db.scalar(
        select(Task.id).where(
            Task.id == parent_task_id,
            Task.user_id == current_user.id,
            Task.is_deleted.is_(False),
        ),
    )
    if parent_id is None:
        raise AppException(status_code=404, message="parent task not found")


def _ensure_expected_version(task: Task, expected_version: int | None) -> None:
    if expected_version is not None and expected_version != task.version:
        raise AppException(status_code=409, message="version conflict")


def _owned_parent_task_id_or_none(
    db: Session, current_user: User, parent_task_id: int | None
) -> int | None:
    if parent_task_id is None:
        return None
    parent_id = db.scalar(
        select(Task.id).where(
            Task.id == parent_task_id,
            Task.user_id == current_user.id,
            Task.is_deleted.is_(False),
        ),
    )
    return parent_id


def _snapshot(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "version": task.version,
        "is_deleted": task.is_deleted,
        "list_type": task.list_type,
        "project": task.project,
    }


def _task_to_export_dict(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "content": task.content,
        "status": task.status,
        "priority": task.priority,
        "tag": task.tag,
        "project": task.project,
        "list_type": task.list_type,
        "due_time": task.due_time.isoformat() if task.due_time else None,
        "remind_time": task.remind_time.isoformat() if task.remind_time else None,
        "repeat_rule": task.repeat_rule,
        "planned_date": task.planned_date.isoformat() if task.planned_date else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "snoozed_until": task.snoozed_until.isoformat() if task.snoozed_until else None,
        "checklist": task.checklist or [],
        "is_template": task.is_template,
        "version": task.version,
        "is_deleted": task.is_deleted,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def list_tasks(
    db: Session,
    current_user: User,
    *,
    q: str | None = None,
    status: str | None = None,
    tag: str | None = None,
    project: str | None = None,
    list_type: str | None = None,
    planned_date: date | None = None,
    view: str | None = None,
    now: datetime | None = None,
    include_deleted: bool = False,
    templates_only: bool = False,
    cursor_id: int | None = None,
    cursor_updated_at: datetime | None = None,
    offset: int = 0,
    limit: int = 100,
) -> list[Task]:
    if (cursor_id is None) != (cursor_updated_at is None):
        raise AppException(
            status_code=400, message="cursor_id and cursor_updated_at must be provided together"
        )
    if cursor_id is not None and offset:
        raise AppException(
            status_code=400, message="offset cannot be combined with cursor pagination"
        )

    conditions = [Task.user_id == current_user.id]
    if not include_deleted:
        conditions.append(Task.is_deleted.is_(False))
    search_query = _normalize_search_query(q)
    if search_query:
        search_terms = search_query["terms"]
        conditions.append(_build_search_condition(search_terms))
    if status:
        conditions.append(_completed_status_condition() if _is_completed_status(status) else Task.status == status)
    if tag:
        conditions.append(Task.tag == tag)
    if project:
        conditions.append(Task.project == project)
    if list_type:
        conditions.append(Task.list_type == list_type)
    if planned_date:
        conditions.append(Task.planned_date == planned_date)
    if templates_only:
        conditions.append(Task.is_template.is_(True))
    _apply_view_conditions(conditions, view=view, now=now)
    current = normalize_to_utc_naive(now) if now else utc_now()
    order_specs = _task_order_specs(current, search_query)
    if cursor_id is not None:
        cursor_task = _get_task_cursor(db, current_user, cursor_id, cursor_updated_at)
        conditions.append(
            _build_cursor_condition(
                order_specs, _task_cursor_values(cursor_task, current, search_query)
            )
        )

    query = (
        select(Task)
        .where(*conditions)
        .order_by(*_order_by_clauses(order_specs))
        .offset(offset)
        .limit(limit)
    )
    return list(db.scalars(query))


def _normalize_search_query(q: str | None) -> dict[str, Any] | None:
    if not q:
        return None
    normalized = " ".join(q.split()).strip()
    if not normalized:
        return None
    terms: list[str] = []
    raw_terms: list[str] = []
    seen: set[str] = set()
    for term in normalized.split(" "):
        escaped = _escape_like_pattern(term)
        if not escaped or escaped in seen:
            continue
        seen.add(escaped)
        terms.append(escaped)
        raw_terms.append(term)
    if not terms:
        return None
    return {
        "normalized": _escape_like_pattern(normalized),
        "raw_normalized": normalized,
        "terms": terms,
        "raw_terms": raw_terms,
    }


def _build_search_condition(terms: list[str]):
    searchable_columns = (Task.title, Task.content, Task.tag, Task.project)
    return and_(
        *[
            or_(
                *[column.ilike(f"%{term}%", escape="\\") for column in searchable_columns],
            )
            for term in terms
        ],
    )


def _search_order_specs(normalized_query: str, terms: list[str]) -> tuple[tuple[Any, str], ...]:
    phrase = f"%{normalized_query}%"
    title_all_terms = and_(
        *[Task.title.ilike(f"%{term}%", escape="\\") for term in terms],
    )
    any_title_term = or_(
        *[Task.title.ilike(f"%{term}%", escape="\\") for term in terms],
    )
    any_term_matches = or_(
        *[
            or_(
                Task.title.ilike(f"%{term}%", escape="\\"),
                Task.content.ilike(f"%{term}%", escape="\\"),
                Task.tag.ilike(f"%{term}%", escape="\\"),
                Task.project.ilike(f"%{term}%", escape="\\"),
            )
            for term in terms
        ],
    )
    return (
        (
            case(
                (Task.title.ilike(phrase, escape="\\"), 0),
                (title_all_terms, 1),
                (any_title_term, 2),
                (any_term_matches, 3),
                else_=4,
            ),
            "asc",
        ),
    )


def _escape_like_pattern(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _get_task_cursor(
    db: Session,
    current_user: User,
    cursor_id: int,
    cursor_updated_at: datetime | None,
) -> Task:
    if cursor_updated_at is None:
        raise AppException(
            status_code=400, message="cursor_id and cursor_updated_at must be provided together"
        )
    task = db.scalar(select(Task).where(Task.user_id == current_user.id, Task.id == cursor_id))
    if task is None:
        raise AppException(status_code=400, message="invalid task cursor")
    if normalize_to_utc_naive(task.updated_at) != normalize_to_utc_naive(cursor_updated_at):
        raise AppException(status_code=400, message="invalid task cursor")
    return task


def _timeline_order_specs(now: datetime) -> tuple[tuple[Any, str], ...]:
    completed = _completed_status_condition()
    open_task = _open_status_condition()
    completed_time = func.coalesce(Task.completed_at, Task.updated_at, Task.due_time)
    return (
        (case((completed, 1), else_=0), "asc"),
        (
            case(
                (completed, 4),
                (and_(open_task, Task.due_time.is_not(None), Task.due_time < now), 0),
                (and_(open_task, Task.due_time.is_not(None)), 1),
                (and_(open_task, Task.planned_date.is_not(None)), 2),
                (and_(open_task, Task.list_type == "today"), 2),
                else_=3,
            ),
            "asc",
        ),
        (case((completed, completed_time), else_=None), "desc"),
        (case((and_(open_task, Task.due_time.is_(None)), 1), else_=0), "asc"),
        (case((open_task, Task.due_time), else_=None), "asc"),
        (
            case(
                (and_(open_task, Task.planned_date.is_(None), Task.list_type == "today"), 1),
                else_=0,
            ),
            "asc",
        ),
        (case((open_task, Task.planned_date), else_=None), "asc"),
        (Task.sort_order, "asc"),
        (Task.priority, "desc"),
        (Task.updated_at, "desc"),
        (Task.id, "desc"),
    )


def _task_order_specs(
    now: datetime, search_query: dict[str, Any] | None
) -> tuple[tuple[Any, str], ...]:
    search_specs = (
        _search_order_specs(search_query["normalized"], search_query["terms"])
        if search_query
        else ()
    )
    return (*search_specs, *_timeline_order_specs(now))


def _order_by_clauses(order_specs: tuple[tuple[Any, str], ...]) -> tuple[Any, ...]:
    return tuple(
        expression.asc() if direction == "asc" else expression.desc()
        for expression, direction in order_specs
    )


def _build_cursor_condition(
    order_specs: tuple[tuple[Any, str], ...], cursor_values: tuple[Any, ...]
):
    comparisons = []
    equalities = []
    for (expression, direction), cursor_value in zip(
        order_specs,
        cursor_values,
        strict=True,
    ):
        comparison = _ordered_value_after_cursor(expression, direction, cursor_value)
        if comparison is not None:
            comparisons.append(and_(*equalities, comparison) if equalities else comparison)
        equalities.append(
            expression.is_(None) if cursor_value is None else expression == cursor_value
        )
    return or_(*comparisons)


def _ordered_value_after_cursor(expression, direction: str, cursor_value: Any):
    if cursor_value is None:
        return None
    if direction == "asc":
        return expression > cursor_value
    return expression < cursor_value


def _task_cursor_values(
    task: Task, now: datetime, search_query: dict[str, Any] | None
) -> tuple[Any, ...]:
    search_values = _search_cursor_values(task, search_query) if search_query else ()
    return (*search_values, *_timeline_cursor_values(task, now))


def _search_cursor_values(task: Task, search_query: dict[str, Any]) -> tuple[int]:
    normalized_query = search_query["raw_normalized"].casefold()
    terms = [term.casefold() for term in search_query["raw_terms"]]
    title = task.title.casefold()
    searchable_values = (
        task.title,
        task.content,
        task.tag,
        task.project,
    )
    if normalized_query in title:
        return (0,)
    if all(term in title for term in terms):
        return (1,)
    if any(term in title for term in terms):
        return (2,)
    if any(term in (value or "").casefold() for term in terms for value in searchable_values):
        return (3,)
    return (4,)


def _timeline_cursor_values(task: Task, now: datetime) -> tuple[Any, ...]:
    completed = _is_completed_status(task.status)
    open_task = not completed
    due_time = normalize_to_utc_naive(task.due_time) if task.due_time else None
    completed_at = normalize_to_utc_naive(task.completed_at) if task.completed_at else None
    updated_at = normalize_to_utc_naive(task.updated_at)
    completed_time = completed_at or updated_at or due_time
    return (
        1 if completed else 0,
        _timeline_bucket(
            completed=completed,
            open_task=open_task,
            due_time=due_time,
            planned_date=task.planned_date,
            list_type=task.list_type,
            now=now,
        ),
        completed_time if completed else None,
        1 if open_task and due_time is None else 0,
        due_time if open_task else None,
        1 if open_task and task.planned_date is None and task.list_type == "today" else 0,
        task.planned_date if open_task else None,
        task.sort_order,
        task.priority,
        updated_at,
        task.id,
    )


def _timeline_bucket(
    *,
    completed: bool,
    open_task: bool,
    due_time: datetime | None,
    planned_date: date | None,
    list_type: str,
    now: datetime,
) -> int:
    if completed:
        return 4
    if open_task and due_time is not None and due_time < now:
        return 0
    if open_task and due_time is not None:
        return 1
    if open_task and planned_date is not None:
        return 2
    if open_task and list_type == "today":
        return 2
    return 3


def _is_completed_status(status: str) -> bool:
    return status.strip().lower() in COMPLETED_STATUSES


def _completed_status_condition() -> Any:
    return Task.status.in_(COMPLETED_STATUSES)


def _open_status_condition() -> Any:
    return Task.status.not_in(COMPLETED_STATUSES)


def get_task_meta(db: Session, current_user: User) -> dict[str, Any]:
    now = utc_now()
    today = shanghai_local_date(now)
    today_start, today_end = shanghai_day_utc_bounds(today)
    base = [Task.user_id == current_user.id]
    active = base + [Task.is_deleted.is_(False)]

    projects = [
        item
        for item in db.scalars(
            select(Task.project)
            .where(*active, Task.project.is_not(None), Task.project != "")
            .distinct()
            .order_by(Task.project.asc()),
        )
    ]
    tags = [
        item
        for item in db.scalars(
            select(Task.tag)
            .where(*active, Task.tag.is_not(None), Task.tag != "")
            .distinct()
            .order_by(Task.tag.asc()),
        )
    ]

    counts_row = db.execute(
        select(
            _count_tasks_expression(active + [_open_status_condition()]).label("open"),
            _count_tasks_expression(active + [_completed_status_condition()]).label("completed"),
            _count_tasks_expression(
                active + [Task.list_type == "inbox", _open_status_condition()]
            ).label("inbox"),
            _count_tasks_expression(
                active
                + [
                    _open_status_condition(),
                    or_(
                        Task.list_type == "today",
                        Task.planned_date == today,
                        and_(
                            Task.due_time.is_not(None),
                            Task.due_time >= today_start,
                            Task.due_time < today_end,
                        ),
                        and_(
                            Task.remind_time.is_not(None),
                            Task.remind_time >= today_start,
                            Task.remind_time < today_end,
                        ),
                        and_(Task.due_time.is_not(None), Task.due_time < now),
                    ),
                ],
            ).label("today"),
            _count_tasks_expression(
                active + [_open_status_condition(), Task.due_time < now]
            ).label("overdue"),
            _count_tasks_expression(active + [Task.is_template.is_(True)]).label("templates"),
            _count_tasks_expression(base + [Task.is_deleted.is_(True)]).label("trash"),
        ).select_from(Task),
    ).one()
    count_names = ("open", "completed", "inbox", "today", "overdue", "templates", "trash")
    counts = {name: int(counts_row._mapping[name] or 0) for name in count_names}
    return {"projects": projects, "tags": tags, "counts": counts}


def export_tasks(db: Session, current_user: User) -> list[dict[str, Any]]:
    tasks = db.scalars(
        select(Task)
        .where(Task.user_id == current_user.id)
        .order_by(Task.is_deleted.asc(), Task.updated_at.desc(), Task.id.desc()),
    )
    return [_task_to_export_dict(task) for task in tasks]


def batch_update_tasks(
    db: Session, current_user: User, payload: TaskBatchRequest
) -> dict[str, Any]:
    tasks = list(
        db.scalars(
            select(Task).where(
                Task.user_id == current_user.id,
                Task.id.in_(payload.task_ids),
            ),
        ),
    )
    now = utc_now()
    for task in tasks:
        if payload.action == "complete":
            task.status = "completed"
            task.completed_at = now
        elif payload.action == "restore":
            task.status = "todo"
            task.completed_at = None
            task.is_deleted = False
            task.deleted_at = None
        elif payload.action == "delete":
            task.is_deleted = True
            task.deleted_at = now
        elif payload.action == "plan":
            task.list_type = "today"
            task.planned_date = payload.planned_date or now.date()
        elif payload.action == "move_inbox":
            task.list_type = "inbox"
            task.planned_date = None
        task.version += 1
        task.updated_at = now
        append_sync_log(
            db,
            user_id=current_user.id,
            task_id=task.id,
            operation=f"batch_{payload.action}",
            version=task.version,
            payload=_snapshot(task),
        )
        db.add(task)
    db.commit()
    for task in tasks:
        db.refresh(task)
    return {"updated_count": len(tasks), "tasks": tasks}


def rename_task_meta(
    db: Session,
    current_user: User,
    *,
    field: str,
    old_value: str,
    new_value: str | None,
) -> dict[str, Any]:
    if field not in {"project", "tag"}:
        raise AppException(status_code=400, message="unsupported metadata field")
    column = Task.project if field == "project" else Task.tag
    tasks = list(
        db.scalars(
            select(Task).where(
                Task.user_id == current_user.id,
                Task.is_deleted.is_(False),
                column == old_value,
            ),
        ),
    )
    now = utc_now()
    normalized = new_value.strip() if new_value else None
    for task in tasks:
        setattr(task, field, normalized or None)
        task.version += 1
        task.updated_at = now
        append_sync_log(
            db,
            user_id=current_user.id,
            task_id=task.id,
            operation=f"{field}_renamed",
            version=task.version,
            payload=_snapshot(task) | {field: getattr(task, field)},
        )
        db.add(task)
    db.commit()
    return {"updated_count": len(tasks), field: normalized}


def import_tasks(db: Session, current_user: User, payload: TaskImportRequest) -> dict[str, Any]:
    created = 0
    updated = 0
    imported_tasks: list[Task] = []
    existing_by_id = _load_import_existing_tasks(db, current_user, payload)
    pending_logs: list[tuple[Task, str]] = []
    now = utc_now()
    for item in payload.tasks:
        existing = existing_by_id.get(item.id) if item.id is not None else None
        if existing is None:
            task = Task(user_id=current_user.id, **_import_item_to_task_data(item))
            db.add(task)
            created += 1
            operation = "import_created"
        else:
            task = existing
            for key, value in _import_item_to_task_data(item).items():
                setattr(task, key, value)
            task.version += 1
            task.updated_at = now
            updated += 1
            operation = "import_updated"
            db.add(task)
        imported_tasks.append(task)
        pending_logs.append((task, operation))
    db.flush()
    for task, operation in pending_logs:
        append_sync_log(
            db,
            user_id=current_user.id,
            task_id=task.id,
            operation=operation,
            version=task.version,
            payload=_snapshot(task),
        )
    db.commit()
    for task in imported_tasks:
        db.refresh(task)
    return {"created_count": created, "updated_count": updated, "tasks": imported_tasks}


def preview_import_tasks(
    db: Session, current_user: User, payload: TaskImportRequest
) -> dict[str, Any]:
    created = 0
    updated = 0
    preview_items: list[dict[str, Any]] = []
    existing_by_id = _load_import_existing_tasks(db, current_user, payload)
    for index, item in enumerate(payload.tasks):
        existing = existing_by_id.get(item.id) if item.id is not None else None
        task_data = _import_item_to_task_data(item)
        if existing is None:
            created += 1
            preview_items.append(
                {
                    "index": index,
                    "action": "create",
                    "incoming_id": item.id,
                    "existing_id": None,
                    "title": task_data["title"],
                    "changes": {},
                }
            )
            continue

        updated += 1
        preview_items.append(
            {
                "index": index,
                "action": "update",
                "incoming_id": item.id,
                "existing_id": existing.id,
                "title": task_data["title"],
                "changes": _task_import_changes(existing, task_data),
            }
        )
    return {"created_count": created, "updated_count": updated, "items": preview_items}


def resolve_task_conflict(
    db: Session,
    current_user: User,
    task_id: int,
    payload: TaskConflictResolveRequest,
) -> Task:
    task = _get_owned_task(db, current_user, task_id, include_deleted=True)
    if payload.strategy == "use_server":
        return task
    if payload.task is None:
        raise AppException(status_code=400, message="task is required for overwrite_server")
    updates = _task_payload_dump(payload.task, exclude_unset=True)
    if "parent_task_id" in updates:
        _ensure_owned_parent_task(
            db, current_user, updates["parent_task_id"], child_task_id=task.id
        )
    for field, value in updates.items():
        setattr(task, field, value)
    task.version += 1
    task.updated_at = utc_now()
    task.is_deleted = False
    task.deleted_at = None
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="conflict_overwritten",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _count_tasks_expression(conditions: list[Any]) -> Any:
    return func.coalesce(func.sum(case((and_(*conditions), 1), else_=0)), 0)


def _apply_view_conditions(
    conditions: list[Any],
    *,
    view: str | None,
    now: datetime | None,
) -> None:
    if not view:
        return
    normalized = view.strip().lower()
    current = normalize_to_utc_naive(now) if now else utc_now()
    today = shanghai_local_date(current)
    today_start, today_end = shanghai_day_utc_bounds(today)

    if normalized == "inbox":
        conditions.extend([Task.list_type == "inbox", _open_status_condition()])
    elif normalized == "today":
        conditions.append(_open_status_condition())
        conditions.append(
            or_(
                Task.list_type == "today",
                Task.planned_date == today,
                and_(
                    Task.due_time.is_not(None),
                    Task.due_time >= today_start,
                    Task.due_time < today_end,
                ),
                and_(
                    Task.remind_time.is_not(None),
                    Task.remind_time >= today_start,
                    Task.remind_time < today_end,
                ),
                and_(
                    _open_status_condition(),
                    Task.due_time.is_not(None),
                    Task.due_time < current,
                ),
            ),
        )
    elif normalized == "overdue":
        conditions.extend([_open_status_condition(), Task.due_time.is_not(None), Task.due_time < current])
    elif normalized == "week":
        end_date = today + timedelta(days=7)
        week_start = today_start
        _, week_end = shanghai_day_utc_bounds(end_date)
        conditions.append(
            or_(
                Task.planned_date.between(today, end_date),
                and_(
                    Task.due_time.is_not(None),
                    Task.due_time >= week_start,
                    Task.due_time < week_end,
                ),
                and_(
                    Task.remind_time.is_not(None),
                    Task.remind_time >= week_start,
                    Task.remind_time < week_end,
                ),
            ),
        )
    elif normalized == "high_priority":
        conditions.extend([_open_status_condition(), Task.priority >= 3])
    elif normalized == "completed":
        conditions.append(_completed_status_condition())
    elif normalized == "templates":
        conditions.append(Task.is_template.is_(True))
    elif normalized == "trash":
        conditions.append(Task.is_deleted.is_(True))


def create_task(db: Session, current_user: User, payload: TaskCreate) -> Task:
    data = _task_payload_dump(payload)
    _ensure_owned_parent_task(db, current_user, data.get("parent_task_id"))
    task = Task(user_id=current_user.id, **data)
    db.add(task)
    db.flush()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="created",
        version=task.version,
        payload=_snapshot(task),
    )
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, current_user: User, task_id: int) -> Task:
    return _get_owned_task(db, current_user, task_id)


def update_task(db: Session, current_user: User, task_id: int, payload: TaskUpdate) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    updates = _task_payload_dump(payload, exclude_unset=True)
    expected_version = updates.pop("expected_version", None)
    _ensure_expected_version(task, expected_version)
    if "parent_task_id" in updates:
        _ensure_owned_parent_task(
            db, current_user, updates["parent_task_id"], child_task_id=task.id
        )
    for field, value in updates.items():
        setattr(task, field, value)
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="updated",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def soft_delete_task(
    db: Session,
    current_user: User,
    task_id: int,
    expected_version: int | None = None,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    _ensure_expected_version(task, expected_version)
    task.is_deleted = True
    task.deleted_at = utc_now()
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="deleted",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def complete_task(
    db: Session,
    current_user: User,
    task_id: int,
    expected_version: int | None = None,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    _ensure_expected_version(task, expected_version)
    was_completed = _is_completed_status(task.status)
    task.status = "completed"
    task.completed_at = utc_now()
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="completed",
        version=task.version,
        payload=_snapshot(task),
    )
    if not was_completed:
        _create_repeat_occurrence_if_needed(db, current_user, task)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def undo_complete_task(
    db: Session,
    current_user: User,
    task_id: int,
    expected_version: int | None = None,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    _ensure_expected_version(task, expected_version)
    task.status = "todo"
    task.completed_at = None
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="undo_completed",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def postpone_task(
    db: Session,
    current_user: User,
    task_id: int,
    payload: TaskPostponeRequest,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    if payload.due_time is not None:
        task.due_time = normalize_to_utc_naive(payload.due_time)
    if payload.remind_time is not None:
        task.remind_time = normalize_to_utc_naive(payload.remind_time)
    if payload.planned_date is not None:
        task.planned_date = payload.planned_date
    task.snoozed_until = None
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="postponed",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def snooze_task(
    db: Session,
    current_user: User,
    task_id: int,
    payload: TaskSnoozeRequest,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    task.snoozed_until = normalize_to_utc_naive(payload.snoozed_until)
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="snoozed",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def plan_task(
    db: Session,
    current_user: User,
    task_id: int,
    payload: TaskPlanRequest,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    task.planned_date = payload.planned_date
    task.list_type = "today"
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="planned",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def restore_task(
    db: Session,
    current_user: User,
    task_id: int,
    expected_version: int | None = None,
) -> Task:
    task = _get_owned_task(db, current_user, task_id, include_deleted=True)
    _ensure_expected_version(task, expected_version)
    task.status = "todo"
    task.is_deleted = False
    task.deleted_at = None
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="restored",
        version=task.version,
        payload=_snapshot(task),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def add_checklist_item(
    db: Session,
    current_user: User,
    task_id: int,
    payload: ChecklistItem,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    checklist = list(task.checklist or [])
    if any(item.get("id") == payload.id for item in checklist):
        raise AppException(status_code=409, message="checklist item already exists")
    checklist.append(payload.model_dump())
    return _save_checklist(db, current_user, task, checklist, "checklist_added")


def update_checklist_item(
    db: Session,
    current_user: User,
    task_id: int,
    item_id: str,
    payload: ChecklistItemUpdate,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    checklist = list(task.checklist or [])
    updated = False
    for item in checklist:
        if item.get("id") != item_id:
            continue
        if payload.title is not None:
            item["title"] = payload.title
        if payload.done is not None:
            item["done"] = payload.done
        updated = True
        break
    if not updated:
        raise AppException(status_code=404, message="checklist item not found")
    return _save_checklist(db, current_user, task, checklist, "checklist_updated")


def delete_checklist_item(
    db: Session,
    current_user: User,
    task_id: int,
    item_id: str,
) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    checklist = list(task.checklist or [])
    next_checklist = [item for item in checklist if item.get("id") != item_id]
    if len(next_checklist) == len(checklist):
        raise AppException(status_code=404, message="checklist item not found")
    return _save_checklist(db, current_user, task, next_checklist, "checklist_deleted")


def instantiate_template(
    db: Session,
    current_user: User,
    template_id: int,
    payload: TaskTemplateInstantiateRequest,
) -> Task:
    template = _get_owned_task(db, current_user, template_id, include_deleted=False)
    if not template.is_template:
        raise AppException(status_code=400, message="task is not a template")

    parent_task_id = _owned_parent_task_id_or_none(db, current_user, template.parent_task_id)
    task = Task(
        user_id=current_user.id,
        title=payload.title or template.title,
        content=payload.content if payload.content is not None else template.content,
        status="todo",
        priority=template.priority,
        tag=payload.tag if payload.tag is not None else template.tag,
        project=payload.project if payload.project is not None else template.project,
        list_type=payload.list_type if payload.list_type is not None else "inbox",
        due_time=normalize_to_utc_naive(payload.due_time)
        if payload.due_time
        else template.due_time,
        remind_time=normalize_to_utc_naive(payload.remind_time)
        if payload.remind_time
        else template.remind_time,
        repeat_rule=template.repeat_rule,
        planned_date=payload.planned_date
        if payload.planned_date is not None
        else template.planned_date,
        parent_task_id=parent_task_id,
        checklist=deepcopy(template.checklist or []),
        is_template=False,
        template_name=None,
        sort_order=template.sort_order,
    )
    db.add(task)
    db.flush()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="template_instantiated",
        version=task.version,
        payload={**_snapshot(task), "template_id": template.id},
    )
    db.commit()
    db.refresh(task)
    return task


def create_next_occurrence(db: Session, current_user: User, task_id: int) -> Task:
    task = _get_owned_task(db, current_user, task_id)
    next_task = _build_repeat_occurrence(task, current_user.id)
    if next_task is None:
        raise AppException(status_code=400, message="unsupported repeat_rule")
    db.add(next_task)
    db.flush()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=next_task.id,
        operation="repeat_created",
        version=next_task.version,
        payload={**_snapshot(next_task), "source_task_id": task.id},
    )
    db.commit()
    db.refresh(next_task)
    return next_task


def _create_repeat_occurrence_if_needed(db: Session, current_user: User, task: Task) -> Task | None:
    if not task.repeat_rule:
        return None
    existing_id = db.scalar(
        select(Task.id).where(
            Task.user_id == current_user.id,
            Task.parent_task_id == task.id,
            Task.is_deleted.is_(False),
        ),
    )
    if existing_id is not None:
        return None

    next_task = _build_repeat_occurrence(task, current_user.id)
    if next_task is None:
        return None
    db.add(next_task)
    db.flush()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=next_task.id,
        operation="repeat_created",
        version=next_task.version,
        payload={**_snapshot(next_task), "source_task_id": task.id},
    )
    return next_task


def _build_repeat_occurrence(task: Task, user_id: int) -> Task | None:
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
        checklist=_reset_checklist(task.checklist or []),
        is_template=False,
        template_name=None,
        sort_order=task.sort_order,
    )


def list_trash(db: Session, current_user: User, *, offset: int = 0, limit: int = 100) -> list[Task]:
    return list(
        db.scalars(
            select(Task)
            .where(Task.user_id == current_user.id, Task.is_deleted.is_(True))
            .order_by(Task.deleted_at.desc(), Task.updated_at.desc(), Task.id.desc())
            .offset(offset)
            .limit(limit),
        ),
    )


def purge_task(db: Session, current_user: User, task_id: int) -> Task:
    task = _get_owned_task(db, current_user, task_id, include_deleted=True)
    if not task.is_deleted:
        raise AppException(status_code=400, message="only deleted tasks can be purged")
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation="purged",
        version=task.version,
        payload=_snapshot(task),
    )
    db.flush()
    db.execute(update(SyncLog).where(SyncLog.task_id == task.id).values(task_id=None))
    db.execute(update(Task).where(Task.parent_task_id == task.id).values(parent_task_id=None))
    db.delete(task)
    db.commit()
    return task


def list_task_history(
    db: Session,
    current_user: User,
    task_id: int,
    *,
    offset: int = 0,
    limit: int = 200,
) -> list[TaskHistoryRead]:
    _get_owned_task(db, current_user, task_id, include_deleted=True)
    logs = db.scalars(
        select(SyncLog)
        .where(SyncLog.user_id == current_user.id, SyncLog.task_id == task_id)
        .order_by(SyncLog.created_at.asc(), SyncLog.id.asc())
        .offset(offset)
        .limit(limit),
    )
    return [
        TaskHistoryRead(
            id=log.id,
            task_id=log.task_id,
            operation=log.action,
            result=log.result,
            version=log.version,
            device_id=log.device_id,
            local_id=log.local_id,
            server_id=log.server_id,
            payload=log.payload,
            created_at=log.created_at,
        )
        for log in logs
    ]


def _task_payload_dump(
    payload: TaskCreate | TaskUpdate, exclude_unset: bool = False
) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=exclude_unset)
    for key in ("due_time", "remind_time", "completed_at", "snoozed_until"):
        if data.get(key) is not None:
            data[key] = normalize_to_utc_naive(data[key])
    checklist = data.get("checklist")
    if checklist is not None:
        data["checklist"] = [
            item.model_dump() if hasattr(item, "model_dump") else item for item in checklist
        ]
    return data


def _import_item_to_task_data(item: TaskImportItem) -> dict[str, Any]:
    return {
        "title": item.title.strip(),
        "content": item.content,
        "status": item.status,
        "priority": item.priority,
        "tag": item.tag,
        "project": item.project,
        "list_type": item.list_type,
        "due_time": normalize_to_utc_naive(item.due_time) if item.due_time else None,
        "remind_time": normalize_to_utc_naive(item.remind_time) if item.remind_time else None,
        "repeat_rule": item.repeat_rule,
        "planned_date": item.planned_date,
        "snoozed_until": normalize_to_utc_naive(item.snoozed_until) if item.snoozed_until else None,
        "checklist": [
            checklist_item.model_dump() if hasattr(checklist_item, "model_dump") else checklist_item
            for checklist_item in item.checklist
        ],
        "is_template": item.is_template,
        "template_name": item.template_name,
        "is_deleted": False,
    }


def _load_import_existing_tasks(
    db: Session, current_user: User, payload: TaskImportRequest
) -> dict[int, Task]:
    incoming_ids = [item.id for item in payload.tasks if item.id is not None]
    if not incoming_ids:
        return {}
    return {
        task.id: task
        for task in db.scalars(
            select(Task).where(
                Task.user_id == current_user.id,
                Task.id.in_(incoming_ids),
            ),
        )
    }


def _task_import_changes(task: Task, task_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    changes: dict[str, dict[str, Any]] = {}
    for key, after in task_data.items():
        before = getattr(task, key)
        if before != after:
            changes[key] = {"before": before, "after": after}
    return changes


def _save_checklist(
    db: Session,
    current_user: User,
    task: Task,
    checklist: list[dict[str, Any]],
    operation: str,
) -> Task:
    task.checklist = checklist
    flag_modified(task, "checklist")
    task.version += 1
    task.updated_at = utc_now()
    append_sync_log(
        db,
        user_id=current_user.id,
        task_id=task.id,
        operation=operation,
        version=task.version,
        payload=_snapshot(task) | {"checklist": checklist},
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


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


def _reset_checklist(checklist: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**item, "done": False} for item in deepcopy(checklist)]


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    first_next_month = date(year, month + 1, 1)
    return (first_next_month - timedelta(days=1)).day
