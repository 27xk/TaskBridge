from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.response import api_success
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.sync import SyncPushRequest
from app.services.device_service import ensure_device_registered
from app.services.sync_service import pull_changes, push_changes
from app.services.websocket_manager import websocket_manager

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status")
def read_sync_status():
    return api_success({"status": "ready"})


@router.get("/pull")
def pull(
    last_sync_time: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return api_success(pull_changes(db, current_user, last_sync_time))


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
