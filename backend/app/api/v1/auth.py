from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserSession, get_current_user, get_current_user_session, get_db
from app.core.config import settings
from app.core.exceptions import AppException
from app.core.rate_limit import check_rate_limit
from app.core.response import api_success
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    RefreshTokenRequest,
    RevokeOtherSessionsRequest,
    UserCreate,
    UserRead,
    WebSocketTicketRequest,
)
from app.services.auth_service import (
    change_password,
    create_websocket_ticket,
    list_refresh_sessions,
    login_user,
    refresh_token_pair,
    register_user,
    revoke_other_device_refresh_sessions,
    revoke_refresh_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/registration")
def registration_status():
    return api_success({"registration_enabled": settings.registration_enabled})


@router.post("/register")
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    if not settings.registration_enabled:
        raise AppException(status_code=403, message="registration disabled")
    check_rate_limit(
        request,
        scope="register",
        identifier=payload.email,
        limit=10,
        window_seconds=300,
    )
    token_pair = register_user(db, payload)
    return api_success(token_pair, status_code=201)


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(
        request,
        scope="login",
        identifier=payload.username_or_email,
        limit=20,
        window_seconds=300,
    )
    token_pair = login_user(db, payload)
    return api_success(token_pair)


@router.post("/refresh")
def refresh(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(
        request,
        scope="refresh",
        identifier="refresh",
        limit=60,
        window_seconds=300,
    )
    token_pair = refresh_token_pair(db, payload.refresh_token, payload.device_id)
    return api_success(token_pair)


@router.get("/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    return api_success(UserRead.model_validate(current_user))


@router.put("/password")
def update_password(
    payload: PasswordChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    check_rate_limit(
        request,
        scope="change-password",
        identifier=str(current_session.user.id),
        limit=10,
        window_seconds=300,
    )
    return api_success(
        change_password(
            db,
            current_session.user,
            current_session.refresh_token.id,
            payload,
        ),
    )


@router.get("/sessions")
def read_sessions(
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    return api_success(list_refresh_sessions(db, current_session.user))


@router.post("/sessions/revoke-other-devices")
def revoke_other_sessions(
    payload: RevokeOtherSessionsRequest,
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    if payload.device_id != current_session.refresh_token.device_id:
        raise AppException(status_code=404, message="current session not found")
    return api_success(
        revoke_other_device_refresh_sessions(
            db,
            current_session.user,
            current_session.refresh_token.device_id or "",
        ),
    )


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    return api_success(revoke_refresh_session(db, current_session.user, session_id))


@router.post("/ws-ticket")
def create_ws_ticket(
    payload: WebSocketTicketRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    check_rate_limit(
        request,
        scope="ws-ticket",
        identifier=f"{current_session.user.id}:{payload.device_id}",
        limit=120,
        window_seconds=300,
    )
    return api_success(
        create_websocket_ticket(
            db,
            current_session.user,
            current_session.refresh_token.id,
            payload.device_id,
        ),
    )
