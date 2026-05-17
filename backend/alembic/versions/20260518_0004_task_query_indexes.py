"""add task query indexes

Revision ID: 20260518_0004
Revises: 20260518_0003
Create Date: 2026-05-18 00:30:00
"""

from alembic import op

revision = "20260518_0004"
down_revision = "20260518_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_tasks_user_deleted_updated", "tasks", ["user_id", "is_deleted", "updated_at"], unique=False)
    op.create_index("ix_tasks_user_status", "tasks", ["user_id", "status"], unique=False)
    op.create_index("ix_tasks_user_tag", "tasks", ["user_id", "tag"], unique=False)
    op.create_index("ix_tasks_user_template", "tasks", ["user_id", "is_template"], unique=False)
    op.create_index("ix_sync_logs_user_task_created", "sync_logs", ["user_id", "task_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sync_logs_user_task_created", table_name="sync_logs")
    op.drop_index("ix_tasks_user_template", table_name="tasks")
    op.drop_index("ix_tasks_user_tag", table_name="tasks")
    op.drop_index("ix_tasks_user_status", table_name="tasks")
    op.drop_index("ix_tasks_user_deleted_updated", table_name="tasks")
