import csv
import io
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.response import api_success
from app.models.user import User
from app.schemas.task import (
    ChecklistItem,
    ChecklistItemUpdate,
    TaskBatchRequest,
    TaskConflictResolveRequest,
    TaskCreate,
    TaskHistoryRead,
    TaskImportRequest,
    TaskPlanRequest,
    TaskRenameMetaRequest,
    TaskPostponeRequest,
    TaskRead,
    TaskSnoozeRequest,
    TaskTemplateInstantiateRequest,
    TaskUpdate,
)
from app.services.task_service import (
    add_checklist_item,
    batch_update_tasks,
    complete_task,
    create_task,
    create_next_occurrence,
    delete_checklist_item,
    get_task,
    get_task_meta,
    export_tasks,
    import_tasks,
    instantiate_template,
    list_task_history,
    list_tasks,
    list_trash,
    plan_task,
    postpone_task,
    purge_task,
    rename_task_meta,
    restore_task,
    resolve_task_conflict,
    snooze_task,
    soft_delete_task,
    undo_complete_task,
    update_task,
    update_checklist_item,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


@router.get("")
def read_tasks(
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
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = list_tasks(
        db,
        current_user,
        q=q,
        view=view,
        now=now,
        status=status,
        tag=tag,
        project=project,
        list_type=list_type,
        planned_date=planned_date,
        include_deleted=include_deleted,
        templates_only=templates_only,
        offset=offset,
        limit=limit,
    )
    return api_success([TaskRead.model_validate(task) for task in tasks])


@router.get("/meta")
def meta(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return api_success(get_task_meta(db, current_user))


@router.get("/export")
def export(
    format: str = Query(default="json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    return [
        {key: _escape_csv_cell(value) for key, value in row.items()}
        for row in rows
    ]


def _escape_csv_cell(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped.startswith(CSV_FORMULA_PREFIXES):
        return f"'{value}"
    return value


@router.post("")
def create(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = create_task(db, current_user, payload)
    return api_success(TaskRead.model_validate(task), status_code=201)


@router.post("/batch")
def batch(
    payload: TaskBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = batch_update_tasks(db, current_user, payload)
    return api_success(
        {
            "updated_count": result["updated_count"],
            "tasks": [TaskRead.model_validate(task) for task in result["tasks"]],
        },
    )


@router.post("/import")
def import_backup(
    payload: TaskImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = import_tasks(db, current_user, payload)
    return api_success(
        {
            "created_count": result["created_count"],
            "updated_count": result["updated_count"],
            "tasks": [TaskRead.model_validate(task) for task in result["tasks"]],
        },
    )


@router.post("/projects/rename")
def rename_project(
    payload: TaskRenameMetaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    payload: TaskRenameMetaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = list_trash(db, current_user, offset=offset, limit=limit)
    return api_success([TaskRead.model_validate(task) for task in tasks])


@router.post("/templates/{template_id}/instantiate")
def instantiate(
    template_id: int,
    payload: TaskTemplateInstantiateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = instantiate_template(db, current_user, template_id, payload)
    return api_success(TaskRead.model_validate(task), status_code=201)


@router.get("/{task_id}")
def read_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.get("/{task_id}/history")
def history(
    task_id: int,
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items: list[TaskHistoryRead] = list_task_history(db, current_user, task_id, offset=offset, limit=limit)
    return api_success(items)


@router.post("/{task_id}/resolve-conflict")
def resolve_conflict(
    task_id: int,
    payload: TaskConflictResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = resolve_task_conflict(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.put("/{task_id}")
def update(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = update_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/checklist")
def add_checklist(
    task_id: int,
    payload: ChecklistItem,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = add_checklist_item(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.put("/{task_id}/checklist/{item_id}")
def update_checklist(
    task_id: int,
    item_id: str,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = update_checklist_item(db, current_user, task_id, item_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.delete("/{task_id}/checklist/{item_id}")
def delete_checklist(
    task_id: int,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = delete_checklist_item(db, current_user, task_id, item_id)
    return api_success(TaskRead.model_validate(task))


@router.delete("/{task_id}")
def delete(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = soft_delete_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.delete("/{task_id}/purge")
def purge(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = purge_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/complete")
def complete(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = complete_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/next-occurrence")
def next_occurrence(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = create_next_occurrence(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task), status_code=201)


@router.post("/{task_id}/undo-complete")
def undo_complete(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = undo_complete_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/postpone")
def postpone(
    task_id: int,
    payload: TaskPostponeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = postpone_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/snooze")
def snooze(
    task_id: int,
    payload: TaskSnoozeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = snooze_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/plan")
def plan(
    task_id: int,
    payload: TaskPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = plan_task(db, current_user, task_id, payload)
    return api_success(TaskRead.model_validate(task))


@router.post("/{task_id}/restore")
def restore(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = restore_task(db, current_user, task_id)
    return api_success(TaskRead.model_validate(task))
