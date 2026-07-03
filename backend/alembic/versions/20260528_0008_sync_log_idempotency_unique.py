"""enforce sync log idempotency uniqueness

Revision ID: 20260528_0008
Revises: 20260524_0007
Create Date: 2026-05-28 21:30:00
"""

import sqlalchemy as sa

from alembic import op

revision = "20260528_0008"
down_revision = "20260524_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    payload_cast = "CAST(payload AS TEXT)" if bind.dialect.name == "sqlite" else "CAST(payload AS CHAR)"
    conflict_count = bind.scalar(
        sa.text(
            f"""
            SELECT COUNT(*)
            FROM (
                SELECT 1
                FROM sync_logs
                WHERE user_id IS NOT NULL
                  AND device_id IS NOT NULL
                  AND local_id IS NOT NULL
                  AND operation IS NOT NULL
                  AND client_version IS NOT NULL
                GROUP BY user_id, device_id, local_id, operation, client_version
                HAVING COUNT(*) > 1
                   AND (
                       COUNT(DISTINCT COALESCE(task_id, -1)) > 1
                    OR COUNT(DISTINCT COALESCE(server_id, -1)) > 1
                    OR COUNT(DISTINCT COALESCE(result, '<null>')) > 1
                    OR COUNT(DISTINCT COALESCE(version, -1)) > 1
                    OR COUNT(DISTINCT COALESCE({payload_cast}, '<null>')) > 1
                   )
            ) conflicting_sync_logs
            """,
        ),
    )
    if conflict_count:
        raise RuntimeError(
            "Cannot create uq_sync_logs_idempotency while duplicate sync_logs have conflicting "
            "task_id, server_id, result, version, or payload values. Back up the database and "
            "resolve these rows manually before rerunning the migration.",
        )

    if bind.dialect.name in {"mysql", "mariadb"}:
        op.execute(
            """
            DELETE sync_logs FROM sync_logs
            INNER JOIN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY user_id, device_id, local_id, operation, client_version
                            ORDER BY id DESC
                        ) AS duplicate_rank
                    FROM sync_logs
                    WHERE user_id IS NOT NULL
                      AND device_id IS NOT NULL
                      AND local_id IS NOT NULL
                      AND operation IS NOT NULL
                      AND client_version IS NOT NULL
                ) ranked_sync_logs
                WHERE duplicate_rank > 1
            ) duplicate_sync_logs ON sync_logs.id = duplicate_sync_logs.id
            """,
        )
    else:
        op.execute(
            """
            DELETE FROM sync_logs
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY user_id, device_id, local_id, operation, client_version
                            ORDER BY id DESC
                        ) AS duplicate_rank
                    FROM sync_logs
                    WHERE user_id IS NOT NULL
                      AND device_id IS NOT NULL
                      AND local_id IS NOT NULL
                      AND operation IS NOT NULL
                      AND client_version IS NOT NULL
                ) ranked_sync_logs
                WHERE duplicate_rank > 1
            )
            """,
        )

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("sync_logs") as batch_op:
            batch_op.create_unique_constraint(
                "uq_sync_logs_idempotency",
                ["user_id", "device_id", "local_id", "operation", "client_version"],
            )
    else:
        op.create_unique_constraint(
            "uq_sync_logs_idempotency",
            "sync_logs",
            ["user_id", "device_id", "local_id", "operation", "client_version"],
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("sync_logs") as batch_op:
            batch_op.drop_constraint("uq_sync_logs_idempotency", type_="unique")
    else:
        op.drop_constraint("uq_sync_logs_idempotency", "sync_logs", type_="unique")
