from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.utils.time import utc_now


class SyncLog(Base):
    __tablename__ = "sync_logs"
    __table_args__ = (
        Index("ix_sync_logs_user_created", "user_id", "created_at"),
        Index("ix_sync_logs_user_task_created", "user_id", "task_id", "created_at"),
        UniqueConstraint(
            "user_id",
            "device_id",
            "local_id",
            "operation",
            "client_version",
            name="uq_sync_logs_idempotency",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), index=True, nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    local_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    server_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column("operation", String(32), nullable=False)
    result: Mapped[str] = mapped_column(String(32), default="applied", nullable=False)
    client_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=utc_now)
