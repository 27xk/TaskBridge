"""Task write invariants shared by REST, bulk imports and sync."""

import logging

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.core.task_clock import advance_task_clock
from app.utils.time import utc_iso

logger = logging.getLogger("taskbridge.task_events")


@event.listens_for(Session, "before_flush")
def timestamp_task_writes(db: Session, _flush_context, _instances) -> None:
    from app.models.task import Task

    changed = [
        task
        for task in db.new | db.dirty | db.deleted
        if isinstance(task, Task) and (task in db.new or task in db.deleted or db.is_modified(task))
    ]
    for user_id in sorted({task.user_id for task in changed}):
        watermark = advance_task_clock(db, user_id)
        for task in changed:
            if task.user_id == user_id and task not in db.deleted:
                task.updated_at = watermark
    transaction = db.get_nested_transaction() or db.get_transaction()
    pending = db.info.setdefault("task_flush_notifications", [])
    overrides = db.info.pop("task_notification_actions", {})
    for task in changed:
        action = overrides.get(id(task)) or _notification_action(db, task)
        pending.append((transaction, task, action, db.info.get("actor_device_id")))


def _notification_action(db: Session, task) -> str:
    if task in db.new:
        return "created"
    if task in db.deleted or task.is_deleted:
        return "deleted"
    state = inspect(task)
    if state.attrs.is_deleted.history.has_changes():
        return "restored"
    if state.attrs.status.history.has_changes() and task.status in {"completed", "done"}:
        return "completed"
    return "updated"


@event.listens_for(Session, "after_flush_postexec")
def collect_task_notifications(db: Session, _flush_context) -> None:
    events = db.info.setdefault("task_commit_notifications", [])
    for transaction, task, action, excluded in db.info.pop("task_flush_notifications", []):
        events.append(
            (
                transaction,
                task.user_id,
                excluded,
                {
                    "event": "task_changed",
                    "action": action,
                    "task_id": task.id,
                    "version": task.version,
                    "server_time": utc_iso(task.updated_at),
                },
            )
        )


@event.listens_for(Session, "after_commit")
def publish_task_notifications(db: Session) -> None:
    if db.in_nested_transaction():
        return
    from app.services.websocket_manager import websocket_manager

    for _, user_id, excluded, payload in db.info.pop("task_commit_notifications", []):
        try:
            websocket_manager.submit_committed(user_id, excluded, payload)
        except Exception:
            # Notification is an invalidation hint; committed HTTP data remains
            # authoritative and reconnect/periodic pull repairs a missed hint.
            logger.exception("committed task notification could not be queued")


@event.listens_for(Session, "after_soft_rollback")
def discard_rolled_back_notifications(db: Session, previous_transaction) -> None:
    db.info.pop("task_flush_notifications", None)
    db.info.pop("task_notification_actions", None)
    if previous_transaction.parent is None:
        db.info.pop("task_commit_notifications", None)
        return

    def survives(entry):
        transaction = entry[0]
        while transaction is not None:
            if transaction is previous_transaction:
                return False
            transaction = transaction.parent
        return True

    db.info["task_commit_notifications"] = [
        entry for entry in db.info.get("task_commit_notifications", []) if survives(entry)
    ]


@event.listens_for(Session, "after_transaction_end")
def discard_closed_transaction_notifications(db: Session, transaction) -> None:
    # Session.close() ends its transaction without after_soft_rollback. A Session
    # may subsequently be reused; uncommitted invalidations must not survive it.
    if transaction.parent is None:
        db.info.pop("task_commit_notifications", None)
        db.info.pop("task_flush_notifications", None)
        db.info.pop("task_notification_actions", None)
