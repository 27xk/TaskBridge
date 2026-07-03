from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.redis import redis_health_status
from app.core.response import api_success
from app.models.user import User
from app.schemas.sync import (
    SYNC_PULL_DEFAULT_LIMIT,
    SYNC_PULL_MAX_LIMIT,
    SYNC_PUSH_MAX_CHANGES,
    SyncPushRequest,
)
from app.services.device_service import ensure_device_registered
from app.services.sync_service import pull_changes, push_changes
from app.services.websocket_manager import websocket_manager
from app.utils.time import utc_iso

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status")
def read_sync_status(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    redis_status = redis_health_status()
    return api_success(
        {
            "status": "ready" if redis_status == "ok" else "degraded",
            "database": "ok",
            "redis": redis_status,
            "websocket": "enabled" if redis_status == "ok" else "degraded",
            "server_time": utc_iso(),
            "limits": {
                "push_max_changes": SYNC_PUSH_MAX_CHANGES,
                "pull_default_limit": SYNC_PULL_DEFAULT_LIMIT,
                "pull_max_limit": SYNC_PULL_MAX_LIMIT,
            },
        },
    )


@router.get("/pull")
def pull(
    last_sync_time: datetime = Query(...),
    limit: int = Query(SYNC_PULL_DEFAULT_LIMIT, ge=1, le=SYNC_PULL_MAX_LIMIT),
    cursor_updated_at: datetime | None = Query(default=None),
    cursor_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return api_success(
        pull_changes(
            db,
            current_user,
            last_sync_time,
            limit=limit,
            cursor_updated_at=cursor_updated_at,
            cursor_id=cursor_id,
        ),
    )


@router.post("/push")
async def push(
    payload: SyncPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_device_registered(db, current_user, payload.device_id)
    result, notifications = push_changes(db, current_user, payload)
    for notification in notifications:
        await websocket_manager.notify_user_except_device(
            current_user.id,
            payload.device_id,
            notification,
        )
    return api_success(result)
