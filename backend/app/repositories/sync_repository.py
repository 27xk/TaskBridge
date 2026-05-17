from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task


def list_changed_tasks(
    db: Session,
    *,
    user_id: int,
    since: datetime,
    is_deleted: bool,
) -> list[Task]:
    return list(
        db.scalars(
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.is_deleted.is_(is_deleted),
                Task.updated_at > since,
            )
            .order_by(Task.updated_at.asc(), Task.id.asc()),
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
