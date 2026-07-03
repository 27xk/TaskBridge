from datetime import timedelta

from sqlalchemy import UniqueConstraint, select
from sqlalchemy.orm import Session

from app.core.security import hash_refresh_token
from app.models.product_event import ProductEvent
from app.models.sync_log import SyncLog
from app.models.user import RefreshToken, User
from app.services.maintenance_service import (
    cleanup_product_events,
    cleanup_refresh_tokens,
    cleanup_sync_logs,
)
from app.utils.time import utc_now
from tests.conftest import auth_headers


def test_cleanup_queries_have_supporting_indexes() -> None:
    refresh_indexes = {index.name for index in RefreshToken.__table__.indexes}
    sync_log_indexes = {index.name for index in SyncLog.__table__.indexes}
    product_event_indexes = {index.name for index in ProductEvent.__table__.indexes}

    assert "ix_refresh_tokens_expires_at" in refresh_indexes
    assert "ix_refresh_tokens_revoked_at" in refresh_indexes
    assert "ix_sync_logs_user_created" in sync_log_indexes
    assert "ix_product_events_user_created" in product_event_indexes


def test_sync_log_idempotency_is_database_enforced() -> None:
    sync_log_indexes = {index.name for index in SyncLog.__table__.indexes}
    unique_constraints = {
        constraint.name: tuple(column.name for column in constraint.columns)
        for constraint in SyncLog.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert "ix_sync_logs_idempotency" not in sync_log_indexes
    assert unique_constraints["uq_sync_logs_idempotency"] == (
        "user_id",
        "device_id",
        "local_id",
        "operation",
        "client_version",
    )


def test_cleanup_refresh_tokens_removes_expired_and_old_revoked_tokens(
    client,
    db_session: Session,
) -> None:
    auth_headers(client, "cleanup-user", "cleanup@example.com")
    user = db_session.scalar(select(User).where(User.username == "cleanup-user"))
    assert user is not None
    now = utc_now()

    active = RefreshToken(
        user_id=user.id,
        device_id="device",
        token_hash=hash_refresh_token("active"),
        expires_at=now + timedelta(days=1),
    )
    expired = RefreshToken(
        user_id=user.id,
        device_id="device",
        token_hash=hash_refresh_token("expired"),
        expires_at=now - timedelta(days=10),
    )
    revoked = RefreshToken(
        user_id=user.id,
        device_id="device",
        token_hash=hash_refresh_token("revoked"),
        expires_at=now + timedelta(days=1),
        revoked_at=now - timedelta(days=31),
    )
    db_session.add_all([active, expired, revoked])
    db_session.commit()

    deleted_count = cleanup_refresh_tokens(db_session, now=now)
    db_session.commit()

    remaining_hashes = set(db_session.scalars(select(RefreshToken.token_hash)))
    assert deleted_count == 2
    assert hash_refresh_token("active") in remaining_hashes
    assert hash_refresh_token("expired") not in remaining_hashes
    assert hash_refresh_token("revoked") not in remaining_hashes


def test_cleanup_sync_logs_keeps_recent_logs(client, db_session: Session) -> None:
    auth_headers(client, "sync-log-cleanup", "sync-log-cleanup@example.com")
    user = db_session.scalar(select(User).where(User.username == "sync-log-cleanup"))
    assert user is not None
    now = utc_now()

    recent = SyncLog(
        user_id=user.id,
        action="update",
        result="applied",
        version=1,
        created_at=now - timedelta(days=30),
    )
    stale = SyncLog(
        user_id=user.id,
        action="update",
        result="applied",
        version=1,
        created_at=now - timedelta(days=181),
    )
    db_session.add_all([recent, stale])
    db_session.commit()

    deleted_count = cleanup_sync_logs(db_session, user_id=user.id, now=now)
    db_session.commit()

    remaining_actions = list(db_session.scalars(select(SyncLog.created_at)))
    assert deleted_count == 1
    assert remaining_actions == [recent.created_at]


def test_cleanup_product_events_keeps_recent_events(client, db_session: Session) -> None:
    auth_headers(client, "event-cleanup", "event-cleanup@example.com")
    user = db_session.scalar(select(User).where(User.username == "event-cleanup"))
    assert user is not None
    now = utc_now()

    recent = ProductEvent(
        user_id=user.id,
        name="task_created",
        source="desktop",
        properties={},
        created_at=now - timedelta(days=30),
        occurred_at=now - timedelta(days=30),
    )
    stale = ProductEvent(
        user_id=user.id,
        name="task_completed",
        source="desktop",
        properties={},
        created_at=now - timedelta(days=367),
        occurred_at=now - timedelta(days=367),
    )
    db_session.add_all([recent, stale])
    db_session.commit()

    deleted_count = cleanup_product_events(db_session, user_id=user.id, now=now)
    db_session.commit()

    remaining_names = list(db_session.scalars(select(ProductEvent.name)))
    assert deleted_count == 1
    assert remaining_names == ["task_created"]
