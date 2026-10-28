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
    RefreshSessionRead,
    RefreshTokenRequest,
    RevokeOtherSessionsRequest,
    RevokeSessionsResponse,
    TokenPair,
    UserCreate,
    UserRead,
    WebSocketTicketRequest,
    WebSocketTicketResponse,
)
from app.schemas.responses import ApiResponse, RegistrationStatus, SessionRevoked
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
REFRESH_COOKIE_NAME = "taskbridge_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"


@router.get("/registration", response_model=ApiResponse[RegistrationStatus])
def registration_status():
    return api_success({"registration_enabled": settings.registration_enabled})


@router.post("/register", response_model=ApiResponse[TokenPair], status_code=201)
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
    return _token_response(token_pair, request, status_code=201)


@router.post("/login", response_model=ApiResponse[TokenPair])
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(
        request,
        scope="login",
        identifier=payload.username_or_email,
        limit=20,
        window_seconds=300,
    )
    token_pair = login_user(db, payload)
    return _token_response(token_pair, request)


@router.post("/refresh", response_model=ApiResponse[TokenPair])
def refresh(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(
        request,
        scope="refresh",
        identifier="refresh",
        limit=60,
        window_seconds=300,
    )
    refresh_token = payload.refresh_token or request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise AppException(status_code=401, message="invalid refresh token")
    token_pair = refresh_token_pair(db, refresh_token, payload.device_id)
    return _token_response(token_pair, request)


@router.delete("/session", response_model=ApiResponse[SessionRevoked])
def logout_current_session(
    request: Request,
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    revoke_refresh_session(db, current_session.user, current_session.refresh_token.id)
    response = api_success({"revoked": True})
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        secure=request.url.scheme == "https",
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/me", response_model=ApiResponse[UserRead])
def read_current_user(current_user: User = Depends(get_current_user)):
    return api_success(UserRead.model_validate(current_user))


@router.put("/password", response_model=ApiResponse[RevokeSessionsResponse])
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


@router.get("/sessions", response_model=ApiResponse[list[RefreshSessionRead]])
def read_sessions(
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    return api_success(list_refresh_sessions(db, current_session.user))


@router.post("/sessions/revoke-other-devices", response_model=ApiResponse[RevokeSessionsResponse])
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


@router.delete("/sessions/{session_id}", response_model=ApiResponse[RefreshSessionRead])
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_session: CurrentUserSession = Depends(get_current_user_session),
):
    return api_success(revoke_refresh_session(db, current_session.user, session_id))


@router.post("/ws-ticket", response_model=ApiResponse[WebSocketTicketResponse])
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


def _token_response(token_pair, request: Request, *, status_code: int = 200):
    response = api_success(token_pair, status_code=status_code)
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token_pair.refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        secure=request.url.scheme == "https",
        httponly=True,
        samesite="lax",
    )
    return response
