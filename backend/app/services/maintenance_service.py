from datetime import datetime, timedelta

from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from app.models.sync_log import SyncLog
from app.models.user import RefreshToken
from app.utils.time import utc_now

EXPIRED_REFRESH_TOKEN_RETENTION_DAYS = 7
REVOKED_REFRESH_TOKEN_RETENTION_DAYS = 30
SYNC_LOG_RETENTION_DAYS = 180


def cleanup_refresh_tokens(db: Session, *, now: datetime | None = None) -> int:
    current = now or utc_now()
    expired_cutoff = current - timedelta(days=EXPIRED_REFRESH_TOKEN_RETENTION_DAYS)
    revoked_cutoff = current - timedelta(days=REVOKED_REFRESH_TOKEN_RETENTION_DAYS)
    result = db.execute(
        delete(RefreshToken).where(
            or_(
                RefreshToken.expires_at < expired_cutoff,
                RefreshToken.revoked_at < revoked_cutoff,
            ),
        ),
    )
    return int(result.rowcount or 0)


def cleanup_sync_logs(db: Session, *, user_id: int, now: datetime | None = None) -> int:
    current = now or utc_now()
    cutoff = current - timedelta(days=SYNC_LOG_RETENTION_DAYS)
    result = db.execute(
        delete(SyncLog).where(
            SyncLog.user_id == user_id,
            SyncLog.created_at < cutoff,
        ),
    )
    return int(result.rowcount or 0)
