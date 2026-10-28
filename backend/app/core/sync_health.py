"""Bounded, expiring client snapshots; identities never become metric labels."""

from threading import Lock
from time import monotonic

SOURCES = ("web", "desktop", "android")
SNAPSHOT_TTL_SECONDS = 900
MAX_SNAPSHOTS = 10_000
_lock = Lock()
_snapshots: dict[tuple[int, str, str], tuple[float, int, int, float, float | None]] = {}


def _expire(now: float) -> None:
    for key, value in list(_snapshots.items()):
        if now - value[0] > SNAPSHOT_TTL_SECONDS:
            del _snapshots[key]


def record_sync_health(user_id, source, device_id, pending_count, conflict_count,
                       oldest_pending_seconds, last_success_age_seconds, *, now=None) -> None:
    current = monotonic() if now is None else now
    with _lock:
        _expire(current)
        key = (user_id, source, device_id)
        if key not in _snapshots and len(_snapshots) >= MAX_SNAPSHOTS:
            del _snapshots[min(_snapshots, key=lambda item: _snapshots[item][0])]
        _snapshots[key] = (current, pending_count, conflict_count,
                           oldest_pending_seconds, last_success_age_seconds)


def render_sync_health_metrics(*, now=None) -> str:
    current = monotonic() if now is None else now
    values = {source: [0, 0, 0.0, 0.0, 0] for source in SOURCES}
    with _lock:
        _expire(current)
        for (_, source, _), (received, pending, conflicts, oldest, success_age) in _snapshots.items():
            row = values[source]
            row[0] += pending
            row[1] += conflicts
            row[2] = max(row[2], oldest + current - received if pending else 0)
            row[3] = max(row[3], success_age + current - received if success_age is not None else 0)
            row[4] += 1
    lines = []
    for index, (name, description) in enumerate((
        ("pending_tasks", "Pending tasks reported by recently active clients."),
        ("conflicts", "Unresolved conflicts reported by recently active clients."),
        ("oldest_pending_seconds", "Maximum pending age among recently active clients."),
        ("last_success_age_seconds", "Maximum reported time since successful sync."),
        ("reporting_workspaces", "Recently reporting workspaces; snapshots expire after 15 minutes."),
    )):
        metric = f"taskbridge_client_{name}"
        lines.extend((f"# HELP {metric} {description}", f"# TYPE {metric} gauge"))
        lines.extend(f'{metric}{{source="{source}"}} {row[index]:g}' for source, row in values.items())
    return "\n".join(lines) + "\n"
