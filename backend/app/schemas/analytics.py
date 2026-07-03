from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProductEventCreate(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    source: Literal["web", "desktop", "android"]
    route: str | None = Field(default=None, max_length=256)
    app_version: str | None = Field(default=None, max_length=64)
    device_id: str | None = Field(default=None, max_length=128)
    session_id: str | None = Field(default=None, max_length=128)
    properties: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None


class ProductEventAck(BaseModel):
    accepted: bool
    event_id: int


class ProductEventNameSummary(BaseModel):
    name: str
    count: int


class ProductEventSourceSummary(BaseModel):
    source: str
    count: int


class ProductEventSummary(BaseModel):
    total_count: int
    days: int
    events: list[ProductEventNameSummary]
    sources: list[ProductEventSourceSummary]
