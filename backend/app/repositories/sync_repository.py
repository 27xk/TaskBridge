from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.task import Task


def list_changed_tasks_page(
    db: Session,
    *,
    user_id: int,
    since: datetime,
    limit: int,
    cursor_updated_at: datetime | None = None,
    cursor_id: int | None = None,
) -> list[Task]:
    conditions = [
        Task.user_id == user_id,
        Task.updated_at > since,
    ]
    if cursor_updated_at is not None and cursor_id is not None:
        conditions.append(
            or_(
                Task.updated_at > cursor_updated_at,
                (Task.updated_at == cursor_updated_at) & (Task.id > cursor_id),
            ),
        )

    return list(
        db.scalars(
            select(Task)
            .where(*conditions)
            .order_by(Task.updated_at.asc(), Task.id.asc())
            .limit(limit),
        ),
    )


def get_owned_task(
    db: Session,
    *,
    user_id: int,
    task_id: int,
    include_deleted: bool = False,
) -> Task | None:
    conditions = [Task.id == task_id, Task.user_id == user_id]
    if not include_deleted:
        conditions.append(Task.is_deleted.is_(False))
    return db.scalar(select(Task).where(*conditions))
