import hashlib
import secrets
import time

from redis.exceptions import RedisError

from app.core.config import settings
from app.core.redis import get_redis_client

_MEMORY_TICKETS: dict[str, tuple[int, str, float]] = {}


def issue_websocket_ticket(user_id: int, device_id: str) -> tuple[str, int]:
    _prune_expired_memory_tickets()
    ticket = secrets.token_urlsafe(32)
    ticket_hash = _hash_ticket(ticket)
    payload = f"{user_id}|{device_id}"
    ttl_seconds = max(10, settings.websocket_ticket_expire_seconds)
    expires_at = time.time() + ttl_seconds
    try:
        get_redis_client().setex(
            _ticket_key(ticket_hash),
            ttl_seconds,
            payload,
        )
    except RedisError:
        _MEMORY_TICKETS[ticket_hash] = (user_id, device_id, expires_at)
    return ticket, ttl_seconds


def consume_websocket_ticket(ticket: str, expected_device_id: str) -> int | None:
    ticket_hash = _hash_ticket(ticket)
    try:
        redis = get_redis_client()
        raw_payload = redis.get(_ticket_key(ticket_hash))
        if raw_payload:
            redis.delete(_ticket_key(ticket_hash))
            return _parse_payload(_to_text(raw_payload), expected_device_id)
    except RedisError:
        pass

    memory_payload = _MEMORY_TICKETS.pop(ticket_hash, None)
    if memory_payload is None:
        return None
    user_id, device_id, expires_at = memory_payload
    if expires_at < time.time() or device_id != expected_device_id:
        return None
    return user_id


def _parse_payload(payload: str, expected_device_id: str) -> int | None:
    raw_user_id, _, device_id = payload.partition("|")
    if device_id != expected_device_id:
        return None
    try:
        return int(raw_user_id)
    except ValueError:
        return None


def _hash_ticket(ticket: str) -> str:
    return hashlib.sha256(ticket.encode("utf-8")).hexdigest()


def _to_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return str(value)


def _ticket_key(ticket_hash: str) -> str:
    return f"taskbridge:ws-ticket:{ticket_hash}"


def _prune_expired_memory_tickets() -> None:
    now = time.time()
    for ticket_hash, (_, _, expires_at) in list(_MEMORY_TICKETS.items()):
        if expires_at < now:
            _MEMORY_TICKETS.pop(ticket_hash, None)
