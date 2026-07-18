"""add task create idempotency keys

Revision ID: 20260715_0013
Revises: 20260605_0012
Create Date: 2026-07-15 13:00:00
"""

import sqlalchemy as sa

from alembic import op

revision = "20260715_0013"
down_revision = "20260605_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("client_request_id", sa.String(length=128), nullable=True))
    op.add_column("tasks", sa.Column("create_payload_hash", sa.String(length=64), nullable=True))
    op.create_index(
        "uq_tasks_user_client_request_id",
        "tasks",
        ["user_id", "client_request_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_tasks_user_client_request_id", table_name="tasks")
    op.drop_column("tasks", "create_payload_hash")
    op.drop_column("tasks", "client_request_id")
