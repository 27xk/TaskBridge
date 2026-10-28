"""serialize task sync watermarks and preserve MySQL microseconds

Revision ID: 20261026_0014
Revises: 20260715_0013
"""

import sqlalchemy as sa
from sqlalchemy.dialects.mysql import DATETIME

from alembic import op

revision = "20261026_0014"
down_revision = "20260715_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    precision = sa.DateTime().with_variant(DATETIME(fsp=6), "mysql")
    op.add_column("users", sa.Column("task_sync_time", precision, nullable=True))
    if op.get_bind().dialect.name == "mysql":
        op.alter_column(
            "tasks",
            "updated_at",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            type_=DATETIME(fsp=6),
        )
    # Seed above existing data, including imports with future timestamps.
    op.execute(
        sa.text(
            "UPDATE users SET task_sync_time = "
            "(SELECT MAX(tasks.updated_at) FROM tasks WHERE tasks.user_id = users.id)"
        )
    )


def downgrade() -> None:
    op.drop_column("users", "task_sync_time")
    if op.get_bind().dialect.name == "mysql":
        op.alter_column(
            "tasks",
            "updated_at",
            existing_type=DATETIME(fsp=6),
            existing_nullable=False,
            type_=sa.DateTime(),
        )
