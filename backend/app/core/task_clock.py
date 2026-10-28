from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.utils.time import utc_now


def advance_task_clock(db: Session, user_id: int) -> datetime:
    """Serialize task writes/pulls on their owner until the transaction ends.

    A no-op UPDATE acquires a write lock on SQLite, where FOR UPDATE is ignored.
    MySQL's locking SELECT reads current committed state even in REPEATABLE READ.
    Both writes and pull reserve a strictly increasing per-user watermark; an
    edit flushed before a pull must commit first, and a later flush gets a newer
    timestamp regardless of when its request/application clock started.
    """
    from app.models.user import User

    with db.no_autoflush:
        db.execute(
            update(User)
            .where(User.id == user_id)
            .values(task_sync_time=User.task_sync_time, updated_at=User.updated_at)
            .execution_options(synchronize_session=False),
        )
        previous = db.scalar(
            select(User.task_sync_time).where(User.id == user_id).with_for_update(),
        )
        watermark = max(utc_now(), previous + timedelta(microseconds=1)) if previous else utc_now()
        db.execute(
            update(User)
            .where(User.id == user_id)
            .values(task_sync_time=watermark, updated_at=User.updated_at)
            .execution_options(synchronize_session=False),
        )
    return watermark
