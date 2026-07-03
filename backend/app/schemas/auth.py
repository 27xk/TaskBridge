from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    device_id: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("invalid username")
        return normalized

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("invalid email")
        return normalized


class LoginRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=1, max_length=128)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=16)
    device_id: str | None = Field(default=None, min_length=1, max_length=128)


class WebSocketTicketRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)


class WebSocketTicketResponse(BaseModel):
    ticket: str
    expires_in: int


class RefreshSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str | None
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class RevokeOtherSessionsRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)


class RevokeSessionsResponse(BaseModel):
    revoked: int


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead
