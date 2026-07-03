import csv
import io
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.rate_limit import check_rate_limit
from app.core.response import api_success
from app.models.user import User
from app.schemas.task import (
    ChecklistItem,
    ChecklistItemUpdate,
    TaskBatchRequest,
    TaskConflictResolveRequest,
    TaskCreate,
    TaskHistoryRead,
    TaskImportPreviewResult,
    TaskImportRequest,
    TaskPlanRequest,
    TaskPostponeRequest,
    TaskRead,
    TaskRenameMetaRequest,
    TaskSnoozeRequest,
    TaskTemplateInstantiateRequest,
    TaskUpdateWithVersion,
)
from app.services.task_service import (
    add_checklist_item,
    batch_update_tasks,
    complete_task,
    create_next_occurrence,
    create_task,
    delete_checklist_item,
    export_tasks,
    get_task,
    get_task_meta,
    import_tasks,
    instantiate_template,
    list_task_history,
    list_tasks,
    list_trash,
    plan_task,
    postpone_task,
    preview_import_tasks,
    purge_task,
    rename_task_meta,
    resolve_task_conflict,
    restore_task,
    snooze_task,
    soft_delete_task,
    undo_complete_task,
    update_checklist_item,
    update_task,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")
TASK_RATE_WINDOW_SECONDS = 300
TASK_READ_RATE_LIMIT = 240
TASK_SEARCH_RATE_LIMIT = 120
TASK_WRITE_RATE_LIMIT = 180
TASK_BULK_WRITE_RATE_LIMIT = 40
TASK_EXPORT_RATE_LIMIT = 20


def _check_task_rate_limit(
    request: Request,
    current_user: User,
    *,
    scope: str,
    limit: int,
) -> None:
    check_rate_limit(
        request,
        scope=scope,
        identifier=str(current_user.id),
        limit=limit,
        window_seconds=TASK_RATE_WINDOW_SECONDS,
    )


@router.get("")
def read_tasks(
    request: Request,
    q: str | None = None,
    view: str | None = None,
    now: datetime | None = None,
    status: str | None = None,
    tag: str | None = None,
    project: str | None = None,
    list_type: str | None = None,
    planned_date: date | None = None,
    include_deleted: bool = False,
    templates_only: bool = False,
    cursor_id: int | None = Query(default=None, ge=1),
    cursor_updated_at: datetime | None = None,
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    normalized_q = q.strip() if q else None
    if not normalized_q:
        normalized_q = None
    _check_task_rate_limit(
        request,
        current_user,
        scope="tasks:search" if normalized_q else "tasks:list",
        limit=TASK_SEARCH_RATE_LIMIT if normalized_q else TASK_READ_RATE_LIMIT,
    )
    tasks = list_tasks(
        db,
        current_user,
        q=normalized_q,
        view=view,
        now=now,
        status=status,
        tag=tag,
        project=project,
        list_type=list_type,
        planned_date=planned_date,
        include_deleted=include_deleted,
        templates_only=templates_only,
        cursor_id=cursor_id,
        cursor_updated_at=cursor_updated_at,
        offset=offset,
        limit=limit,
    )
    return api_success([TaskRead.model_validate(task) for task in tasks])


@router.get("/meta")
def meta(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:meta", limit=TASK_READ_RATE_LIMIT)
    return api_success(get_task_meta(db, current_user))


@router.get("/export")
def export(
    request: Request,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:export", limit=TASK_EXPORT_RATE_LIMIT
    )
    tasks = export_tasks(db, current_user)
    if format == "csv":
        buffer = io.StringIO()
        fieldnames = [
            "id",
            "title",
            "status",
            "priority",
            "tag",
            "project",
            "list_type",
            "due_time",
            "planned_date",
            "repeat_rule",
            "is_deleted",
            "updated_at",
        ]
        writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(_escape_csv_rows(tasks))
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="taskbridge-tasks.csv"'},
        )
    return api_success({"format": "json", "tasks": tasks})


def _escape_csv_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: _escape_csv_cell(value) for key, value in row.items()} for row in rows]


def _escape_csv_cell(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped.startswith(CSV_FORMULA_PREFIXES):
        return f"'{value}"
    return value


@router.post("")
def create(
    request: Request,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = create_task(db, current_user, payload)
    return api_success(TaskRead.model_validate(task), status_code=201)


@router.post("/batch")
def batch(
    request: Request,
    payload: TaskBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:bulk", limit=TASK_BULK_WRITE_RATE_LIMIT
    )
    result = batch_update_tasks(db, current_user, payload)
    return api_success(
        {
            "updated_count": result["updated_count"],
            "tasks": [TaskRead.model_validate(task) for task in result["tasks"]],
        },
    )


@router.post("/import")
def import_backup(
    request: Request,
    payload: TaskImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:import", limit=TASK_BULK_WRITE_RATE_LIMIT
    )
    result = import_tasks(db, current_user, payload)
    return api_success(
        {
            "created_count": result["created_count"],
            "updated_count": result["updated_count"],
            "tasks": [TaskRead.model_validate(task) for task in result["tasks"]],
        },
    )


@router.post("/import/preview")
def preview_import_backup(
    request: Request,
    payload: TaskImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:import-preview", limit=TASK_BULK_WRITE_RATE_LIMIT
    )
    result = preview_import_tasks(db, current_user, payload)
    return api_success(TaskImportPreviewResult.model_validate(result))


@router.post("/projects/rename")
def rename_project(
    request: Request,
    payload: TaskRenameMetaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:bulk", limit=TASK_BULK_WRITE_RATE_LIMIT
    )
    return api_success(
        rename_task_meta(
            db,
            current_user,
            field="project",
            old_value=payload.old_value,
            new_value=payload.new_value,
        ),
    )


@router.post("/tags/rename")
def rename_tag(
    request: Request,
    payload: TaskRenameMetaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:bulk", limit=TASK_BULK_WRITE_RATE_LIMIT
    )
    return api_success(
        rename_task_meta(
            db,
            current_user,
            field="tag",
            old_value=payload.old_value,
            new_value=payload.new_value,
        ),
    )


@router.get("/trash")
def read_trash(
    request: Request,
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:trash", limit=TASK_READ_RATE_LIMIT)
    tasks = list_trash(db, current_user, offset=offset, limit=limit)
    return api_success([TaskRead.model_validate(task) for task in tasks])


@router.post("/templates/{template_id}/instantiate")
def instantiate(
    request: Request,
    template_id: int,
    payload: TaskTemplateInstantiateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = instantiate_template(db, current_user, template_id, payload)
    return api_success(TaskRead.model_validate(task), status_code=201)


@router.get("/{task_id}")
def read_task(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:read", limit=TASK_READ_RATE_LIMIT)
    task = get_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.get("/{task_id}/history")
def history(
    request: Request,
    task_id: int,
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:history", limit=TASK_READ_RATE_LIMIT)
    items: list[TaskHistoryRead] = list_task_history(
        db, current_user, task_id, offset=offset, limit=limit
    )
    return api_success(items)


@router.post("/{task_id}/resolve-conflict")
def resolve_conflict(
    request: Request,
    task_id: int,
    payload: TaskConflictResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = resolve_task_conflict(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.put("/{task_id}")
def update(
    request: Request,
    task_id: int,
    payload: TaskUpdateWithVersion,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = update_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/checklist")
def add_checklist(
    request: Request,
    task_id: int,
    payload: ChecklistItem,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = add_checklist_item(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.put("/{task_id}/checklist/{item_id}")
def update_checklist(
    request: Request,
    task_id: int,
    item_id: str,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = update_checklist_item(db, current_user, task_id, item_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.delete("/{task_id}/checklist/{item_id}")
def delete_checklist(
    request: Request,
    task_id: int,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = delete_checklist_item(db, current_user, task_id, item_id)
    return api_success(TaskRead.model_validate(task))


@router.delete("/{task_id}")
def delete(
    request: Request,
    task_id: int,
    expected_version: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = soft_delete_task(db, current_user, task_id, expected_version=expected_version)
    return api_success(TaskRead.model_validate(task))


@router.delete("/{task_id}/purge")
def purge(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(
        request, current_user, scope="tasks:purge", limit=TASK_BULK_WRITE_RATE_LIMIT
    )
    task = purge_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/complete")
def complete(
    request: Request,
    task_id: int,
    expected_version: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = complete_task(db, current_user, task_id, expected_version=expected_version)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/next-occurrence")
def next_occurrence(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = create_next_occurrence(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task), status_code=201)


@router.post("/{task_id}/undo-complete")
def undo_complete(
    request: Request,
    task_id: int,
    expected_version: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = undo_complete_task(db, current_user, task_id, expected_version=expected_version)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/postpone")
def postpone(
    request: Request,
    task_id: int,
    payload: TaskPostponeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = postpone_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/snooze")
def snooze(
    request: Request,
    task_id: int,
    payload: TaskSnoozeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = snooze_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/plan")
def plan(
    request: Request,
    task_id: int,
    payload: TaskPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = plan_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/restore")
def restore(
    request: Request,
    task_id: int,
    expected_version: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_task_rate_limit(request, current_user, scope="tasks:write", limit=TASK_WRITE_RATE_LIMIT)
    task = restore_task(db, current_user, task_id, expected_version=expected_version)
    return api_success(TaskRead.model_validate(task))
