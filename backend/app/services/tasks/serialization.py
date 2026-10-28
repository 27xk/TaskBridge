from typing import Any

from app.models.task import Task


def task_snapshot(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "version": task.version,
        "is_deleted": task.is_deleted,
        "list_type": task.list_type,
        "project": task.project,
    }
