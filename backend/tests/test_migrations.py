import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_alembic_upgrade_head_runs_against_empty_sqlite_database(tmp_path) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "taskbridge-migration-smoke.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
    env["ENVIRONMENT"] = "development"

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_root,
        env=env,
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    with sqlite3.connect(database_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'",
            )
        }
        sync_log_columns = {row[1] for row in connection.execute("PRAGMA table_info(sync_logs)")}
        sync_log_indexes = {row[1] for row in connection.execute("PRAGMA index_list(sync_logs)")}
        product_event_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(product_events)")
        }
        task_indexes = {row[1] for row in connection.execute("PRAGMA index_list(tasks)")}
        task_columns = {row[1] for row in connection.execute("PRAGMA table_info(tasks)")}
        current_revision = connection.execute(
            "SELECT version_num FROM alembic_version",
        ).fetchone()[0]

    assert {"users", "tasks", "sync_logs", "refresh_tokens", "devices", "product_events"} <= tables
    assert {"device_id", "local_id", "server_id", "client_version", "payload"} <= sync_log_columns
    assert "ix_sync_logs_idempotency" not in sync_log_indexes
    assert {
        "ix_tasks_user_deleted_project",
        "ix_tasks_user_deleted_list_type",
        "ix_tasks_user_deleted_due_time",
        "ix_tasks_user_deleted_updated_id",
    } <= task_indexes
    assert {"client_request_id", "create_payload_hash"} <= task_columns
    assert "uq_tasks_user_client_request_id" in task_indexes
    assert {
        "ix_product_events_user_created",
        "ix_product_events_user_name_created",
        "ix_product_events_user_source_created",
    } <= product_event_indexes
    assert "ix_tasks_user_deleted_updated" not in task_indexes
    assert current_revision == "20260715_0013"
