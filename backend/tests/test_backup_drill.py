import gzip
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "verify-backup.py"


def load_script():
    assert SCRIPT.exists(), "isolated backup drill script must exist"
    spec = importlib.util.spec_from_file_location("verify_backup", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeDocker:
    def __init__(self, fail_import=False):
        self.calls = []
        self.fail_import = fail_import
        self.sql = None

    def __call__(self, command, **kwargs):
        self.calls.append(command)
        if "stdin" in kwargs:
            self.sql = kwargs["stdin"].read()
            if self.fail_import:
                raise subprocess.CalledProcessError(1, command, stderr=b"Import failed")
        output = b""
        if "--execute" in command:
            query = command[command.index("--execute") + 1]
            if "SELECT VERSION()" in query:
                output = b"8.4.7\n"
            elif "information_schema.tables" in query:
                output = b"tasks\nusers\n"
            elif "COUNT(*)" in query:
                output = b"2\n" if "`tasks`" in query else b"1\n"
        return subprocess.CompletedProcess(command, 0, stdout=output, stderr=b"")


def test_drill_restores_only_a_unique_ephemeral_container_and_records_exact_counts(tmp_path):
    module = load_script()
    backup = tmp_path / "backup.sql.gz"
    backup.write_bytes(gzip.compress(b"CREATE TABLE tasks (id INT);\n"))
    docker = FakeDocker()
    report = module.verify_backup(backup, run=docker, wait=lambda _: None)
    start = next(call for call in docker.calls if call[1] == "run")
    assert start[start.index("--network") + 1] == "none"
    assert start[start.index("--name") + 1].startswith("taskbridge-backup-drill-")
    assert "mysql:8.4" in start
    assert "/var/lib/mysql:rw" in start
    assert not any(value in start for value in ["-p", "--publish", "-v", "--volume", "--mount"])
    assert docker.sql == b"CREATE TABLE tasks (id INT);\n"
    assert report["status"] == "passed"
    assert report["table_count"] == 2
    assert report["row_count"] == 3
    assert report["tables"] == {"tasks": 2, "users": 1}
    assert report["mysql_version"] == "8.4.7"
    assert report["backup_sha256"] == hashlib.sha256(backup.read_bytes()).hexdigest()
    assert report["restore_seconds"] >= 0
    assert docker.calls[-1][1:3] == ["rm", "--force"]
    assert docker.calls[-1][-1] == start[start.index("--name") + 1]
    assert report["container_removed"] is True
    assert all("--protocol=TCP" in call for call in docker.calls if "mysql" in call or "mysqladmin" in call)


def test_corrupt_gzip_is_rejected_before_starting_docker(tmp_path):
    module = load_script()
    backup = tmp_path / "corrupt.sql.gz"
    backup.write_bytes(gzip.compress(b"SELECT 1;\n")[:-4])
    docker = FakeDocker()
    with pytest.raises(module.BackupDrillError):
        module.verify_backup(backup, run=docker)
    assert docker.calls == []


def test_failed_import_still_removes_only_the_drill_container(tmp_path):
    module = load_script()
    backup = tmp_path / "backup.sql.gz"
    backup.write_bytes(gzip.compress(b"invalid SQL"))
    docker = FakeDocker(fail_import=True)
    with pytest.raises(module.BackupDrillError, match="Import failed"):
        module.verify_backup(backup, run=docker)
    assert docker.calls[-1][1:3] == ["rm", "--force"]
    assert docker.calls[-1][-1].startswith("taskbridge-backup-drill-")


@pytest.mark.parametrize("argument", ["--host", "--container", "--database", "--target", "--compose-file"])
def test_cli_refuses_existing_or_production_targets(argument):
    module = load_script()
    with pytest.raises(SystemExit) as error:
        module.parse_arguments(["backup.sql.gz", argument, "production"])
    assert error.value.code == 2


def test_cli_writes_machine_readable_failure_without_claiming_real_restore(tmp_path, monkeypatch):
    module = load_script()
    report = tmp_path / "report.json"
    monkeypatch.setattr(module, "verify_backup", lambda *_: (_ for _ in ()).throw(module.BackupDrillError("Docker is unavailable")))
    assert module.main(["backup.sql.gz", "--report", str(report)]) == 1
    result = json.loads(report.read_text())
    assert result["status"] == "failed"
    assert result["error"] == "Docker is unavailable"


def test_corruption_in_a_later_gzip_member_is_detected_before_docker(tmp_path):
    module = load_script()
    backup = tmp_path / "multi.sql.gz"
    backup.write_bytes(gzip.compress(b"CREATE TABLE tasks (id INT);\n") + gzip.compress(b"SELECT 1;")[:-3])
    docker = FakeDocker()
    with pytest.raises(module.BackupDrillError):
        module.verify_backup(backup, run=docker)
    assert docker.calls == []


def test_failure_to_remove_container_cannot_produce_a_passed_report(tmp_path):
    module = load_script()
    backup = tmp_path / "backup.sql.gz"
    backup.write_bytes(gzip.compress(b"CREATE TABLE tasks (id INT);\n"))
    docker = FakeDocker()

    def fail_cleanup(command, **kwargs):
        if command[1] == "rm":
            raise subprocess.CalledProcessError(1, command)
        return docker(command, **kwargs)

    with pytest.raises(module.BackupDrillError) as error:
        module.verify_backup(backup, run=fail_cleanup)
    assert error.value.report["status"] == "failed"
    assert error.value.report["container_removed"] is False


def test_report_cannot_overwrite_the_original_backup(tmp_path):
    module = load_script()
    backup = tmp_path / "backup.sql.gz"
    original = gzip.compress(b"SELECT 1;")
    backup.write_bytes(original)
    assert module.main([str(backup), "--report", str(backup)]) == 2
    assert backup.read_bytes() == original
