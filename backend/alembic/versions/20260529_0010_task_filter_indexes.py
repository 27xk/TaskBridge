"""add task filter indexes

Revision ID: 20260529_0010
Revises: 20260528_0009
Create Date: 2026-05-29 09:30:00
"""

from alembic import op

revision = "20260529_0010"
down_revision = "20260528_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_tasks_user_deleted_project", "tasks", ["user_id", "is_deleted", "project"], unique=False)
    op.create_index("ix_tasks_user_deleted_list_type", "tasks", ["user_id", "is_deleted", "list_type"], unique=False)
    op.create_index("ix_tasks_user_deleted_due_time", "tasks", ["user_id", "is_deleted", "due_time"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_user_deleted_due_time", table_name="tasks")
    op.drop_index("ix_tasks_user_deleted_list_type", table_name="tasks")
    op.drop_index("ix_tasks_user_deleted_project", table_name="tasks")
