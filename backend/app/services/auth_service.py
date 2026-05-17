from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.user import RefreshToken, User
from app.schemas.auth import LoginRequest, TokenPair, UserCreate, UserRead, WebSocketTicketResponse
from app.services.device_service import ensure_device_registered
from app.services.websocket_ticket_service import issue_websocket_ticket
from app.utils.time import utc_now


def _issue_token_pair(db: Session, user: User) -> TokenPair:
    refresh_token = create_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=utc_now() + timedelta(days=settings.refresh_token_expire_days),
        ),
    )
    db.commit()
    db.refresh(user)
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


def register_user(db: Session, payload: UserCreate) -> TokenPair:
    existing = db.scalar(
        select(User).where(or_(User.username == payload.username, User.email == payload.email)),
    )
    if existing is not None:
        raise AppException(status_code=409, message="username or email already exists")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token_pair(db, user)


def login_user(db: Session, payload: LoginRequest) -> TokenPair:
    identifier = payload.username_or_email.strip().lower()
    user = db.scalar(
        select(User).where(or_(User.username == identifier, User.email == identifier)),
    )
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise AppException(status_code=401, message="invalid username or password")
    return _issue_token_pair(db, user)


def refresh_token_pair(db: Session, refresh_token: str) -> TokenPair:
    token_hash = hash_refresh_token(refresh_token)
    stored_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        ).with_for_update(),
    )
    if stored_token is None or stored_token.expires_at <= utc_now():
        raise AppException(status_code=401, message="invalid refresh token")

    user = db.scalar(select(User).where(User.id == stored_token.user_id, User.is_active.is_(True)))
    if user is None:
        raise AppException(status_code=401, message="user not found")

    stored_token.revoked_at = utc_now()
    db.add(stored_token)
    db.commit()
    return _issue_token_pair(db, user)


def create_websocket_ticket(db: Session, current_user: User, device_id: str) -> WebSocketTicketResponse:
    ensure_device_registered(db, current_user, device_id)
    ticket, expires_in = issue_websocket_ticket(current_user.id, device_id)
    return WebSocketTicketResponse(ticket=ticket, expires_in=expires_in)
