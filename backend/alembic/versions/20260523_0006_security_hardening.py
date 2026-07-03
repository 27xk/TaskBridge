"""security hardening for task parents and device tokens

Revision ID: 20260523_0006
Revises: 20260518_0005
Create Date: 2026-05-23 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "20260523_0006"
down_revision = "20260518_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("device_id", sa.String(length=128), nullable=True))
    op.create_index("ix_refresh_tokens_device_id", "refresh_tokens", ["device_id"], unique=False)

    bind = op.get_bind()
    if bind.dialect.name in {"mysql", "mariadb"}:
        op.execute(
            """
            UPDATE tasks AS child
            LEFT JOIN tasks AS parent ON parent.id = child.parent_task_id
            SET child.parent_task_id = NULL
            WHERE child.parent_task_id IS NOT NULL
              AND (parent.id IS NULL OR parent.user_id <> child.user_id)
            """,
        )
    else:
        op.execute(
            """
            UPDATE tasks
            SET parent_task_id = NULL
            WHERE parent_task_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM tasks AS parent
                WHERE parent.id = tasks.parent_task_id
                  AND parent.user_id = tasks.user_id
              )
            """,
        )
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("tasks") as batch_op:
            batch_op.drop_constraint("fk_tasks_parent_task_id_tasks", type_="foreignkey")
            batch_op.create_foreign_key(
                "fk_tasks_parent_task_id_tasks",
                "tasks",
                ["parent_task_id"],
                ["id"],
                ondelete="SET NULL",
            )
    else:
        op.drop_constraint("fk_tasks_parent_task_id_tasks", "tasks", type_="foreignkey")
        op.create_foreign_key(
            "fk_tasks_parent_task_id_tasks",
            "tasks",
            "tasks",
            ["parent_task_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("tasks") as batch_op:
            batch_op.drop_constraint("fk_tasks_parent_task_id_tasks", type_="foreignkey")
            batch_op.create_foreign_key(
                "fk_tasks_parent_task_id_tasks",
                "tasks",
                ["parent_task_id"],
                ["id"],
            )
    else:
        op.drop_constraint("fk_tasks_parent_task_id_tasks", "tasks", type_="foreignkey")
        op.create_foreign_key(
            "fk_tasks_parent_task_id_tasks",
            "tasks",
            "tasks",
            ["parent_task_id"],
            ["id"],
        )
    op.drop_index("ix_refresh_tokens_device_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "device_id")
