from sqlalchemy.orm import Session

from app.models.sync_log import SyncLog


def append_sync_log(
    db: Session,
    *,
    user_id: int,
    task_id: int | None,
    operation: str | None = None,
    action: str | None = None,
    version: int,
    device_id: str | None = None,
    local_id: str | None = None,
    server_id: int | None = None,
    result: str = "applied",
    client_version: int | None = None,
    payload: dict | None = None,
) -> SyncLog:
    sync_log = SyncLog(
        user_id=user_id,
        task_id=task_id,
        device_id=device_id,
        local_id=local_id,
        server_id=server_id,
        action=action or operation or "unknown",
        result=result,
        client_version=client_version,
        version=version,
        payload=payload,
    )
    db.add(sync_log)
    return sync_log
