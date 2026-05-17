from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.rate_limit import check_rate_limit
from app.core.response import api_success
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    UserCreate,
    UserRead,
    WebSocketTicketRequest,
)
from app.services.auth_service import (
    create_websocket_ticket,
    login_user,
    refresh_token_pair,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
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
    token_pair = refresh_token_pair(db, payload.refresh_token)
    return api_success(token_pair)


@router.get("/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    return api_success(UserRead.model_validate(current_user))


@router.post("/ws-ticket")
def create_ws_ticket(
    payload: WebSocketTicketRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_rate_limit(
        request,
        scope="ws-ticket",
        identifier=f"{current_user.id}:{payload.device_id}",
        limit=120,
        window_seconds=300,
    )
    return api_success(create_websocket_ticket(db, current_user, payload.device_id))
