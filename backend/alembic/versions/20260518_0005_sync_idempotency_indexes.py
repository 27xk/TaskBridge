"""add sync idempotency indexes

Revision ID: 20260518_0005
Revises: 20260518_0004
Create Date: 2026-05-18 01:00:00
"""

from alembic import op

revision = "20260518_0005"
down_revision = "20260518_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_tasks_user_planned_status",
        "tasks",
        ["user_id", "planned_date", "status"],
        unique=False,
    )
    op.create_index(
        "ix_sync_logs_idempotency",
        "sync_logs",
        ["user_id", "device_id", "local_id", "operation", "client_version"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_sync_logs_idempotency", table_name="sync_logs")
    op.drop_index("ix_tasks_user_planned_status", table_name="tasks")
