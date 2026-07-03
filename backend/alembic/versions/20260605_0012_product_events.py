"""add product analytics events

Revision ID: 20260605_0012
Revises: 20260603_0011
Create Date: 2026-06-05 12:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "20260605_0012"
down_revision = "20260603_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("route", sa.String(length=256), nullable=True),
        sa.Column("app_version", sa.String(length=64), nullable=True),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_product_events_id"), "product_events", ["id"], unique=False)
    op.create_index(
        "ix_product_events_user_created",
        "product_events",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_product_events_user_name_created",
        "product_events",
        ["user_id", "name", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_product_events_user_source_created",
        "product_events",
        ["user_id", "source", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_product_events_user_source_created", table_name="product_events")
    op.drop_index("ix_product_events_user_name_created", table_name="product_events")
    op.drop_index("ix_product_events_user_created", table_name="product_events")
    op.drop_index(op.f("ix_product_events_id"), table_name="product_events")
    op.drop_table("product_events")
