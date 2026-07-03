"""drop redundant sync log idempotency index

Revision ID: 20260528_0009
Revises: 20260528_0008
Create Date: 2026-05-28 22:10:00
"""

from alembic import op

revision = "20260528_0009"
down_revision = "20260528_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_sync_logs_idempotency", table_name="sync_logs")


def downgrade() -> None:
    op.create_index(
        "ix_sync_logs_idempotency",
        "sync_logs",
        ["user_id", "device_id", "local_id", "operation", "client_version"],
        unique=False,
    )
