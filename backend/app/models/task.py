from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.utils.time import utc_now


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_deleted_updated", "user_id", "is_deleted", "updated_at"),
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_user_tag", "user_id", "tag"),
        Index("ix_tasks_user_template", "user_id", "is_template"),
        Index("ix_tasks_user_planned_status", "user_id", "planned_date", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="todo", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tag: Mapped[str | None] = mapped_column(String(64), nullable=True)
    project: Mapped[str | None] = mapped_column(String(128), nullable=True)
    list_type: Mapped[str] = mapped_column(String(32), default="inbox", nullable=False)
    due_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    remind_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    repeat_rule: Mapped[str | None] = mapped_column(String(255), nullable=True)
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    checklist: Mapped[list[dict] | None] = mapped_column(JSON, default=list, nullable=True)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    template_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=utc_now,
        onupdate=utc_now,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
