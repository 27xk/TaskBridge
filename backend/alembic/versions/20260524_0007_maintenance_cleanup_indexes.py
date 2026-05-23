"""add maintenance cleanup indexes

Revision ID: 20260524_0007
Revises: 20260523_0006
Create Date: 2026-05-24 00:00:00
"""

from alembic import op

revision = "20260524_0007"
down_revision = "20260523_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], unique=False)
    op.create_index("ix_refresh_tokens_revoked_at", "refresh_tokens", ["revoked_at"], unique=False)
    op.create_index("ix_sync_logs_user_created", "sync_logs", ["user_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sync_logs_user_created", table_name="sync_logs")
    op.drop_index("ix_refresh_tokens_revoked_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
