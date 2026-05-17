"""extend sync logs for device sync

Revision ID: 20260517_0002
Revises: 20260517_0001
Create Date: 2026-05-17 01:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "20260517_0002"
down_revision = "20260517_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sync_logs", sa.Column("device_id", sa.String(length=128), nullable=True))
    op.add_column("sync_logs", sa.Column("local_id", sa.String(length=128), nullable=True))
    op.add_column("sync_logs", sa.Column("server_id", sa.Integer(), nullable=True))
    op.add_column(
        "sync_logs",
        sa.Column("result", sa.String(length=32), server_default="applied", nullable=False),
    )
    op.add_column("sync_logs", sa.Column("client_version", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_sync_logs_device_id"), "sync_logs", ["device_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sync_logs_device_id"), table_name="sync_logs")
    op.drop_column("sync_logs", "client_version")
    op.drop_column("sync_logs", "result")
    op.drop_column("sync_logs", "server_id")
    op.drop_column("sync_logs", "local_id")
    op.drop_column("sync_logs", "device_id")

