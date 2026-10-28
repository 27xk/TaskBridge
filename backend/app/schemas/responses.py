"""HTTP wire envelopes and payloads, independent of platform storage models."""

from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

from app.schemas.task import ChecklistItem, TaskRead

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: T


class ApiError(BaseModel):
    code: int
    message: str
    data: None = None


HTTP_ERROR_RESPONSES = {
    code: {"model": ApiError} for code in (400, 401, 403, 404, 409, 422, 429)
}


class RegistrationStatus(BaseModel):
    registration_enabled: bool


class SessionRevoked(BaseModel):
    revoked: bool


class TaskCounts(BaseModel):
    open: int
    completed: int
    inbox: int
    today: int
    overdue: int
    templates: int
    trash: int


class TaskMetadata(BaseModel):
    projects: list[str]
    tags: list[str]
    counts: TaskCounts


class TaskBatchResult(BaseModel):
    updated_count: int
    tasks: list[TaskRead]


class TaskImportResult(TaskBatchResult):
    created_count: int


class ProjectRenameResult(BaseModel):
    updated_count: int
    project: str | None


class TagRenameResult(BaseModel):
    updated_count: int
    tag: str | None


class ExportedTask(BaseModel):
    id: int
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
    checklist: list[ChecklistItem]
    is_template: bool
    version: int
    is_deleted: bool
    created_at: datetime | None
    updated_at: datetime | None


class TaskExportResult(BaseModel):
    format: Literal["json"]
    tasks: list[ExportedTask]


class SyncLimits(BaseModel):
    push_max_changes: int
    pull_default_limit: int
    pull_max_limit: int


class SyncStatus(BaseModel):
    status: Literal["ready", "degraded"]
    database: str
    redis: str
    websocket: Literal["enabled", "degraded"]
    server_time: str
    limits: SyncLimits


class HealthStatus(BaseModel):
    status: str
    service: str
    version: str


class DependencyStatus(BaseModel):
    status: Literal["ready", "degraded"]
    database: str
    redis: str
    service: str


class ClientErrorAcknowledgement(BaseModel):
    accepted: bool
    report_id: str
    request_id: str
