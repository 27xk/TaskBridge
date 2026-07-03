"""add task cursor pagination index

Revision ID: 20260603_0011
Revises: 20260529_0010
Create Date: 2026-06-03 10:00:00
"""

from alembic import op

revision = "20260603_0011"
down_revision = "20260529_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_tasks_user_deleted_updated", table_name="tasks")
    op.create_index(
        "ix_tasks_user_deleted_updated_id",
        "tasks",
        ["user_id", "is_deleted", "updated_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_user_deleted_updated_id", table_name="tasks")
    op.create_index(
        "ix_tasks_user_deleted_updated",
        "tasks",
        ["user_id", "is_deleted", "updated_at"],
        unique=False,
    )
