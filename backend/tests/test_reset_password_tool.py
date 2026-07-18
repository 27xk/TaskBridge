from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.user import RefreshToken
from app.utils.time import utc_now
from tools.create_user import create_user
from tools.reset_password import reset_password


def test_reset_password_tool_updates_password_and_revokes_sessions(
    db_session: Session,
) -> None:
    user = create_user(
        db_session,
        username="recover-owner",
        email="recover-owner@example.com",
        password="password123",
    )
    session = RefreshToken(
        user_id=user.id,
        device_id="lost-device",
        token_hash="a" * 64,
        expires_at=utc_now() + timedelta(days=7),
    )
    db_session.add(session)
    db_session.commit()

    recovered = reset_password(
        db_session,
        username_or_email="recover-owner@example.com",
        password="recovered-password-456",
    )

    db_session.refresh(session)
    assert recovered.id == user.id
    assert verify_password("recovered-password-456", recovered.password_hash)
    assert not verify_password("password123", recovered.password_hash)
    assert session.revoked_at is not None


def test_reset_password_tool_rejects_unknown_account(db_session: Session) -> None:
    with pytest.raises(ValueError, match="user not found"):
        reset_password(
            db_session,
            username_or_email="missing@example.com",
            password="recovered-password-456",
        )
