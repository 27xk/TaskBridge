from typing import Literal

from pydantic import BaseModel, Field


class ClientErrorReport(BaseModel):
    source: Literal["web", "desktop", "android"] = "web"
    message: str = Field(min_length=1, max_length=500)
    url: str | None = Field(default=None, max_length=512)
    user_agent: str | None = Field(default=None, max_length=255)
    stack: str | None = Field(default=None, max_length=4000)
    app_version: str | None = Field(default=None, max_length=64)
    route: str | None = Field(default=None, max_length=512)
    trace_id: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")
    visibility_state: str | None = Field(default=None, max_length=32)
    online: bool | None = None
