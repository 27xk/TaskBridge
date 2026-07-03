import pytest
from sqlalchemy.orm import Session

from app.models.user import User
from tools.create_user import create_user


def test_create_user_tool_creates_first_self_hosted_account(db_session: Session) -> None:
    user = create_user(
        db_session,
        username="owner",
        email="owner@example.com",
        password="password123",
    )

    saved = db_session.get(User, user.id)
    assert saved is not None
    assert saved.username == "owner"
    assert saved.email == "owner@example.com"
    assert saved.password_hash != "password123"


def test_create_user_tool_rejects_duplicate_identity(db_session: Session) -> None:
    create_user(
        db_session,
        username="owner",
        email="owner@example.com",
        password="password123",
    )

    with pytest.raises(ValueError, match="already exists"):
        create_user(
            db_session,
            username="owner",
            email="owner-2@example.com",
            password="password123",
        )
