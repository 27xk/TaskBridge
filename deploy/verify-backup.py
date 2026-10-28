#!/usr/bin/env python3
"""Restore a gzip SQL backup into a disposable, isolated MySQL 8.4 container."""

import argparse
import gzip
import hashlib
import json
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

MYSQL_IMAGE = "mysql:8.4"
DATABASE = "taskbridge"


class BackupDrillError(RuntimeError):
    def __init__(self, message, report=None):
        super().__init__(message)
        self.report = report or {}


def verify_backup(backup, *, run=subprocess.run, wait=time.sleep, clock=time.monotonic):
    """No existing container, database, server address, or volume can be selected."""
    backup = Path(backup).resolve()
    started = clock()
    name = f"taskbridge-backup-drill-{uuid4().hex}"
    password = secrets.token_urlsafe(32)
    report = {
        "status": "failed",
        "backup": str(backup),
        "started_at": datetime.now(UTC).isoformat(),
        "mysql_image": MYSQL_IMAGE,
        "database": DATABASE,
        "container": name,
    }
    attempted_start = False

    def docker(arguments, **kwargs):
        return run(["docker", *arguments], check=True, capture_output=True,
                   timeout=kwargs.pop("timeout", 60), **kwargs)

    def mysql(query=None, **kwargs):
        command = ["exec", "-i", "--env", f"MYSQL_PWD={password}", name, "mysql",
                   "--user=root", f"--database={DATABASE}", "--batch", "--skip-column-names",
                   "--binary-mode=1", "--protocol=TCP", "--host=127.0.0.1"]
        if query is not None:
            command.extend(["--execute", query])
        return docker(command, **kwargs).stdout.decode("utf-8").strip()

    try:
        with tempfile.TemporaryDirectory(prefix="taskbridge-backup-drill-") as temporary:
            compressed = Path(temporary) / "backup.sql.gz"
            sql = Path(temporary) / "backup.sql"
            digest = hashlib.sha256()
            # Snapshot and hash the exact bytes we validate and restore, without modifying the backup.
            with backup.open("rb") as source, compressed.open("wb") as target:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    target.write(chunk)
            report["backup_sha256"] = digest.hexdigest()
            report["compressed_bytes"] = compressed.stat().st_size
            # Reading to EOF checks every gzip member, trailer, CRC and uncompressed length.
            with gzip.open(compressed, "rb") as source, sql.open("wb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)
            report["sql_bytes"] = sql.stat().st_size
            if not report["sql_bytes"]:
                raise BackupDrillError("The validated backup contains no SQL")

            attempted_start = True
            docker(["run", "--detach", "--name", name, "--network", "none",
                    "--tmpfs", "/var/lib/mysql:rw", "--env", f"MYSQL_ROOT_PASSWORD={password}",
                    "--env", f"MYSQL_DATABASE={DATABASE}", MYSQL_IMAGE, "--skip-log-bin"], timeout=180)
            deadline = clock() + 120
            while True:
                try:
                    docker(["exec", "--env", f"MYSQL_PWD={password}", name,
                            "mysqladmin", "--user=root", "--protocol=TCP", "--host=127.0.0.1",
                            "ping", "--silent"], timeout=10)
                    # TCP excludes the entrypoint's temporary server, which uses --skip-networking.
                    mysql("SELECT 1", timeout=10)
                    break
                except subprocess.CalledProcessError:
                    if clock() >= deadline:
                        raise BackupDrillError("The isolated MySQL container did not become ready") from None
                    wait(1)

            restore_started = clock()
            with sql.open("rb") as source:
                mysql(stdin=source, timeout=3600)
            report["restore_seconds"] = round(clock() - restore_started, 6)
            report["mysql_version"] = mysql("SELECT VERSION()")
            names = mysql("SELECT TABLE_NAME FROM information_schema.tables "
                          "WHERE TABLE_SCHEMA = 'taskbridge' AND TABLE_TYPE = 'BASE TABLE' "
                          "ORDER BY TABLE_NAME").splitlines()
            if not names:
                raise BackupDrillError("The restored taskbridge database has no tables")
            tables = {}
            for table in names:
                quoted = table.replace("`", "``")
                tables[table] = int(mysql(f"SELECT COUNT(*) FROM `{quoted}`"))
            report.update(table_count=len(tables), row_count=sum(tables.values()), tables=tables)
            if "alembic_version" in tables:
                report["schema_versions"] = mysql("SELECT version_num FROM alembic_version").splitlines()
            report["status"] = "passed"
    except Exception as error:
        if isinstance(error, subprocess.CalledProcessError):
            detail = error.stderr or b"Docker command failed"
            message = detail.decode("utf-8", errors="replace") if isinstance(detail, bytes) else str(detail)
        elif isinstance(error, subprocess.TimeoutExpired):
            message = "An isolated backup drill command timed out"
        else:
            message = str(error)
        report["error"] = message.replace(password, "[redacted]")[:2000]
        raise BackupDrillError(report["error"], report) from None
    finally:
        if attempted_start:
            try:
                docker(["rm", "--force", "--volumes", name])
                report["container_removed"] = True
            except Exception:
                report["container_removed"] = False
                if report["status"] == "passed":
                    report["status"] = "failed"
                    report["error"] = "Failed to remove the temporary drill container"
                    raise BackupDrillError(report["error"], report) from None
        report["elapsed_seconds"] = round(clock() - started, 6)
    return report


def parse_arguments(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("backup", type=Path, help="gzip SQL produced by backup-mysql.sh")
    parser.add_argument("--report", type=Path, help="also write the JSON report to this file")
    return parser.parse_args(arguments)


def main(arguments=None):
    options = parse_arguments(arguments)
    if options.report and options.report.resolve() == options.backup.resolve():
        print("The report path must differ from the backup path", file=sys.stderr)
        return 2
    try:
        report = verify_backup(options.backup)
    except BackupDrillError as error:
        report = {**error.report, "status": "failed", "error": str(error)}
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if options.report:
        options.report.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
