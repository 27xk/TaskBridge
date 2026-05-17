from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.task import ChecklistItem, TaskRead

SyncAction = Literal["create", "update", "delete", "complete", "restore"]


class SyncChange(BaseModel):
    local_id: str = Field(min_length=1, max_length=128)
    server_id: int | None = None
    action: SyncAction
    title: str | None = Field(default=None, max_length=255)
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
    parent_task_id: int | None = None
    checklist: list[ChecklistItem] | None = None
    is_template: bool | None = None
    template_name: str | None = Field(default=None, max_length=128)
    sort_order: int | None = Field(default=None, ge=0, le=10_000)
    version: int = Field(ge=0)
    local_updated_at: datetime


class SyncPushRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    changes: list[SyncChange] = Field(min_length=1, max_length=100)


class SyncChangeResult(BaseModel):
    local_id: str
    server_id: int | None
    action: SyncAction
    status: Literal["applied", "conflict", "failed"]
    version: int | None = None
    message: str | None = None
    task: TaskRead | None = None
    server_task: TaskRead | None = None


class SyncPushResponse(BaseModel):
    results: list[SyncChangeResult]
    server_time: str


class SyncPullResponse(BaseModel):
    changed_tasks: list[TaskRead]
    deleted_tasks: list[TaskRead]
    server_time: str


class SyncNotification(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event: str = "task_changed"
    action: str
    task_id: int
    version: int
    server_time: str


class OnlineDevice(BaseModel):
    user_id: int
    device_id: str
    connected_at: str
    last_seen_at: str
    source: Literal["memory", "redis"] = "memory"
