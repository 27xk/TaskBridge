from datetime import date, datetime

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChecklistItem(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    done: bool = False


class ChecklistItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    done: bool | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str | None = Field(default=None, max_length=10000)
    priority: int = Field(default=0, ge=0, le=5)
    tag: str | None = Field(default=None, max_length=64)
    project: str | None = Field(default=None, max_length=128)
    list_type: str = Field(default="inbox", max_length=32)
    due_time: datetime | None = None
    remind_time: datetime | None = None
    repeat_rule: str | None = Field(default=None, max_length=255)
    planned_date: date | None = None
    snoozed_until: datetime | None = None
    parent_task_id: int | None = Field(default=None, ge=1)
    checklist: list[ChecklistItem] = Field(default_factory=list, max_length=100)
    is_template: bool = False
    template_name: str | None = Field(default=None, max_length=128)
    sort_order: int = Field(default=0, ge=0, le=10_000)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, max_length=10000)
    status: str | None = Field(default=None, max_length=32)
    priority: int | None = Field(default=None, ge=0, le=5)
    tag: str | None = Field(default=None, max_length=64)
    project: str | None = Field(default=None, max_length=128)
    list_type: str | None = Field(default=None, max_length=32)
    due_time: datetime | None = None
    remind_time: datetime | None = None
    repeat_rule: str | None = Field(default=None, max_length=255)
    planned_date: date | None = None
    completed_at: datetime | None = None
    snoozed_until: datetime | None = None
    parent_task_id: int | None = Field(default=None, ge=1)
    checklist: list[ChecklistItem] | None = Field(default=None, max_length=100)
    is_template: bool | None = None
    template_name: str | None = Field(default=None, max_length=128)
    sort_order: int | None = Field(default=None, ge=0, le=10_000)


class TaskPostponeRequest(BaseModel):
    due_time: datetime | None = None
    remind_time: datetime | None = None
    planned_date: date | None = None


class TaskSnoozeRequest(BaseModel):
    snoozed_until: datetime


class TaskPlanRequest(BaseModel):
    planned_date: date


class TaskTemplateInstantiateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, max_length=10000)
    project: str | None = Field(default=None, max_length=128)
    tag: str | None = Field(default=None, max_length=64)
    list_type: str | None = Field(default=None, max_length=32)
    due_time: datetime | None = None
    remind_time: datetime | None = None
    planned_date: date | None = None


class TaskBatchRequest(BaseModel):
    task_ids: list[int] = Field(min_length=1, max_length=100)
    action: str = Field(pattern="^(complete|restore|delete|plan|move_inbox)$")
    planned_date: date | None = None


class TaskRenameMetaRequest(BaseModel):
    old_value: str = Field(min_length=1, max_length=128)
    new_value: str | None = Field(default=None, max_length=128)


class TaskImportItem(BaseModel):
    id: int | None = None
    title: str = Field(min_length=1, max_length=255)
    content: str | None = Field(default=None, max_length=10000)
    status: str = Field(default="todo", max_length=32)
    priority: int = Field(default=0, ge=0, le=5)
    tag: str | None = Field(default=None, max_length=64)
    project: str | None = Field(default=None, max_length=128)
    list_type: str = Field(default="inbox", max_length=32)
    due_time: datetime | None = None
    remind_time: datetime | None = None
    repeat_rule: str | None = Field(default=None, max_length=255)
    planned_date: date | None = None
    snoozed_until: datetime | None = None
    checklist: list[ChecklistItem] = Field(default_factory=list, max_length=100)
    is_template: bool = False
    template_name: str | None = Field(default=None, max_length=128)


class TaskImportRequest(BaseModel):
    tasks: list[TaskImportItem] = Field(min_length=1, max_length=500)


class TaskConflictResolveRequest(BaseModel):
    strategy: str = Field(pattern="^(use_server|overwrite_server)$")
    task: TaskUpdate | None = None


class TaskHistoryRead(BaseModel):
    id: int
    task_id: int | None
    operation: str
    result: str
    version: int
    device_id: str | None
    local_id: str | None
    server_id: int | None
    payload: dict[str, Any] | None
    created_at: datetime


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    content: str | None
    status: str
    priority: int
    tag: str | None
    project: str | None
    list_type: str
    due_time: datetime | None
    remind_time: datetime | None
    repeat_rule: str | None
    planned_date: date | None
    completed_at: datetime | None
    snoozed_until: datetime | None
    parent_task_id: int | None
    checklist: list[ChecklistItem]
    is_template: bool
    template_name: str | None
    sort_order: int
    version: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    @field_validator("checklist", mode="before")
    @classmethod
    def _default_checklist(cls, value: object) -> object:
        return [] if value is None else value
