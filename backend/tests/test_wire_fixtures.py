import json
from pathlib import Path

from app.schemas.sync import SyncChange
from app.schemas.task import TaskRead


def test_shared_wire_samples_preserve_explicit_null_false_and_omission():
    fixture = json.loads((Path(__file__).resolve().parents[2] / "shared/http-wire-fixtures.json").read_text(encoding="utf-8"))
    task = TaskRead.model_validate(fixture["task"])
    assert task.title == "契约与 Unicode 📝"
    assert task.content is None
    assert task.checklist[0].done is False
    assert task.updated_at.microsecond == 1
    change = SyncChange.model_validate(fixture["sync_change"])
    encoded = change.model_dump(mode="json", exclude_unset=True)
    assert encoded["content"] is None
    assert encoded["priority"] == 0
    assert "title" not in encoded
