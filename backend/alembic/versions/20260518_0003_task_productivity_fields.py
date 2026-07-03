"""add task productivity fields

Revision ID: 20260518_0003
Revises: 20260517_0002
Create Date: 2026-05-18 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "20260518_0003"
down_revision = "20260517_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("project", sa.String(length=128), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("list_type", sa.String(length=32), nullable=False, server_default="inbox"),
    )
    op.add_column("tasks", sa.Column("planned_date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.add_column("tasks", sa.Column("snoozed_until", sa.DateTime(), nullable=True))
    op.add_column("tasks", sa.Column("parent_task_id", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("checklist", sa.JSON(), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("is_template", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("tasks", sa.Column("template_name", sa.String(length=128), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("tasks") as batch_op:
            batch_op.create_foreign_key(
                "fk_tasks_parent_task_id_tasks",
                "tasks",
                ["parent_task_id"],
                ["id"],
            )
    else:
        op.create_foreign_key(
            "fk_tasks_parent_task_id_tasks",
            "tasks",
            "tasks",
            ["parent_task_id"],
            ["id"],
        )
    op.create_index("ix_tasks_project", "tasks", ["project"], unique=False)
    op.create_index("ix_tasks_list_type", "tasks", ["list_type"], unique=False)
    op.create_index("ix_tasks_planned_date", "tasks", ["planned_date"], unique=False)
    op.create_index("ix_tasks_parent_task_id", "tasks", ["parent_task_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_parent_task_id", table_name="tasks")
    op.drop_index("ix_tasks_planned_date", table_name="tasks")
    op.drop_index("ix_tasks_list_type", table_name="tasks")
    op.drop_index("ix_tasks_project", table_name="tasks")
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("tasks") as batch_op:
            batch_op.drop_constraint("fk_tasks_parent_task_id_tasks", type_="foreignkey")
    else:
        op.drop_constraint("fk_tasks_parent_task_id_tasks", "tasks", type_="foreignkey")

    op.drop_column("tasks", "sort_order")
    op.drop_column("tasks", "template_name")
    op.drop_column("tasks", "is_template")
    op.drop_column("tasks", "checklist")
    op.drop_column("tasks", "parent_task_id")
    op.drop_column("tasks", "snoozed_until")
    op.drop_column("tasks", "completed_at")
    op.drop_column("tasks", "planned_date")
    op.drop_column("tasks", "list_type")
    op.drop_column("tasks", "project")
