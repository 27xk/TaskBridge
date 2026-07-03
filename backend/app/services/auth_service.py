from datetime import datetime, timedelta

from sqlalchemy import or_, select, update
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
from app.schemas.auth import (
    LoginRequest,
    RefreshSessionRead,
    RevokeSessionsResponse,
    TokenPair,
    UserCreate,
    UserRead,
    WebSocketTicketResponse,
)
from app.services.device_service import ensure_device_registered
from app.services.websocket_ticket_service import issue_websocket_ticket
from app.utils.time import utc_now


def _issue_token_pair(db: Session, user: User, device_id: str) -> TokenPair:
    refresh_token = create_refresh_token()
    refresh_session = RefreshToken(
        user_id=user.id,
        device_id=device_id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=utc_now() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh_session)
    db.flush()
    access_token = create_access_token(
        user.id,
        device_id=device_id,
        session_id=refresh_session.id,
    )
    db.commit()
    db.refresh(user)
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


def register_user(db: Session, payload: UserCreate) -> TokenPair:
    existing = db.scalar(
        select(User).where(or_(User.username == payload.username, User.email == payload.email)),
    )
    if existing is not None:
        raise AppException(status_code=409, message="registration failed")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token_pair(db, user, payload.device_id)


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
    return _issue_token_pair(db, user, payload.device_id)


def refresh_token_pair(db: Session, refresh_token: str, device_id: str | None = None) -> TokenPair:
    token_hash = hash_refresh_token(refresh_token)
    stored_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
        ).with_for_update(),
    )
    now = utc_now()
    if stored_token is None or stored_token.expires_at <= now:
        raise AppException(status_code=401, message="invalid refresh token")
    if stored_token.revoked_at is not None:
        _revoke_active_refresh_tokens_for_reuse(db, stored_token, now=now)
        raise AppException(status_code=401, message="invalid refresh token")

    user = db.scalar(select(User).where(User.id == stored_token.user_id, User.is_active.is_(True)))
    if user is None:
        raise AppException(status_code=401, message="user not found")

    token_device_id = stored_token.device_id
    if token_device_id is not None and device_id is not None and token_device_id != device_id:
        raise AppException(status_code=401, message="invalid refresh token")
    if token_device_id is None:
        if device_id is None:
            raise AppException(status_code=401, message="invalid refresh token")
        token_device_id = device_id

    stored_token.revoked_at = now
    db.add(stored_token)
    return _issue_token_pair(db, user, token_device_id)


def _revoke_active_refresh_tokens_for_reuse(
    db: Session,
    reused_token: RefreshToken,
    *,
    now: datetime,
) -> None:
    conditions = [
        RefreshToken.user_id == reused_token.user_id,
        RefreshToken.revoked_at.is_(None),
    ]
    if reused_token.device_id is not None:
        conditions.append(RefreshToken.device_id == reused_token.device_id)
    db.execute(update(RefreshToken).where(*conditions).values(revoked_at=now))
    db.commit()
    db.expire_all()


def list_refresh_sessions(db: Session, current_user: User) -> list[RefreshSessionRead]:
    now = utc_now()
    tokens = db.scalars(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.created_at.desc(), RefreshToken.id.desc()),
    ).all()
    return [RefreshSessionRead.model_validate(token) for token in tokens]


def revoke_refresh_session(
    db: Session,
    current_user: User,
    session_id: int,
) -> RefreshSessionRead:
    token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.id == session_id,
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > utc_now(),
        ),
    )
    if token is None:
        raise AppException(status_code=404, message="session not found")

    token.revoked_at = utc_now()
    db.add(token)
    db.commit()
    db.refresh(token)
    return RefreshSessionRead.model_validate(token)


def revoke_other_device_refresh_sessions(
    db: Session,
    current_user: User,
    current_device_id: str,
) -> RevokeSessionsResponse:
    now = utc_now()
    current_session_id = db.scalar(
        select(RefreshToken.id).where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.device_id == current_device_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        ),
    )
    if current_session_id is None:
        raise AppException(status_code=404, message="current session not found")

    result = db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
            or_(RefreshToken.device_id != current_device_id, RefreshToken.device_id.is_(None)),
        )
        .values(revoked_at=now),
    )
    db.commit()
    return RevokeSessionsResponse(revoked=result.rowcount or 0)


def create_websocket_ticket(
    db: Session,
    current_user: User,
    session_id: int,
    device_id: str,
) -> WebSocketTicketResponse:
    ensure_device_registered(db, current_user, device_id)
    ticket, expires_in = issue_websocket_ticket(current_user.id, device_id, session_id)
    return WebSocketTicketResponse(ticket=ticket, expires_in=expires_in)
