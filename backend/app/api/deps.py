from collections.abc import Generator
from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.exceptions import AppException
from app.core.security import decode_access_token
from app.models.user import RefreshToken, User
from app.utils.time import utc_now

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


@dataclass(frozen=True)
class CurrentUserSession:
    user: User
    refresh_token: RefreshToken


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return get_current_user_session_from_payload(db, decode_access_token(token)).user


def get_current_user_session(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CurrentUserSession:
    return get_current_user_session_from_payload(db, decode_access_token(token))


def get_current_user_session_from_payload(db: Session, payload: dict) -> CurrentUserSession:
    user = _get_user_from_payload(db, payload)
    raw_session_id = payload.get("session_id")
    device_id = payload.get("device_id")
    if raw_session_id is None or not isinstance(device_id, str) or not device_id:
        raise AppException(status_code=401, message="current session not found")
    try:
        session_id = int(raw_session_id)
    except (TypeError, ValueError) as exc:
        raise AppException(status_code=401, message="current session not found") from exc

    refresh_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.id == session_id,
            RefreshToken.user_id == user.id,
            RefreshToken.device_id == device_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > utc_now(),
        ),
    )
    if refresh_token is None:
        raise AppException(status_code=401, message="current session not found")
    return CurrentUserSession(user=user, refresh_token=refresh_token)


def _get_user_from_payload(db: Session, payload: dict) -> User:
    raw_user_id = payload.get("sub")
    if raw_user_id is None:
        raise AppException(status_code=401, message="invalid token")

    try:
        user_id = int(raw_user_id)
    except ValueError as exc:
        raise AppException(status_code=401, message="invalid token") from exc

    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise AppException(status_code=401, message="user not found")
    return user
