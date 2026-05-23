import json

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.exceptions import AppException
from app.core.security import decode_access_token
from app.services.device_service import ensure_device_registered_by_user_id
from app.services.websocket_ticket_service import consume_websocket_ticket
from app.services.websocket_manager import websocket_manager
from app.utils.time import utc_iso

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/sync")
async def sync_socket(
    websocket: WebSocket,
    device_id: str = Query(..., min_length=1, max_length=128),
    ticket: str | None = Query(default=None, min_length=16),
    db: Session = Depends(get_db),
):
    try:
        user_id = _authenticate_sync_socket(websocket, device_id, ticket)
        ensure_device_registered_by_user_id(db, user_id, device_id)
    except (AppException, KeyError, ValueError):
        await websocket.close(code=4401)
        return

    await websocket_manager.connect(user_id, device_id, websocket)
    try:
        while True:
            message = await websocket.receive_text()
            await _handle_client_message(websocket, user_id, device_id, message)
    except WebSocketDisconnect:
        websocket_manager.disconnect(user_id, device_id, websocket)


async def _handle_client_message(
    websocket: WebSocket,
    user_id: int,
    device_id: str,
    message: str,
) -> None:
    if len(message) > 2048:
        await websocket.send_json({"event": "error", "message": "message too large"})
        return
    websocket_manager.refresh(user_id, device_id)
    if message == "ping":
        await websocket.send_json({"event": "pong", "server_time": utc_iso()})
        return

    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        await websocket.send_json({"event": "error", "message": "invalid message"})
        return

    if payload.get("event") == "ping" or payload.get("type") == "ping":
        await websocket.send_json({"event": "pong", "server_time": utc_iso()})
        return

    await websocket.send_json({"event": "ack", "server_time": utc_iso()})


def _authenticate_sync_socket(
    websocket: WebSocket,
    device_id: str,
    ticket: str | None,
) -> int:
    if ticket:
        user_id = consume_websocket_ticket(ticket, device_id)
        if user_id is None:
            raise AppException(status_code=401, message="invalid websocket ticket")
        return user_id

    payload = decode_access_token(_access_token_from_authorization_header(websocket))
    return int(payload["sub"])


def _access_token_from_authorization_header(websocket: WebSocket) -> str:
    authorization = websocket.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppException(status_code=401, message="invalid token")
    return token
