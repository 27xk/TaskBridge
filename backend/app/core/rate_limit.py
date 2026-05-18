from fastapi import Request
from redis.exceptions import RedisError

from app.core.exceptions import AppException
from app.core.redis import get_redis_client

_MEMORY_BUCKETS: dict[str, tuple[int, float]] = {}


def check_rate_limit(
    request: Request,
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> None:
    client_host = request.client.host if request.client else "unknown"
    normalized_identifier = identifier.strip().lower()[:128] or "anonymous"
    key = f"taskbridge:rate:{scope}:{client_host}:{normalized_identifier}"

    try:
        redis = get_redis_client()
        current = redis.incr(key)
        if current == 1:
            redis.expire(key, window_seconds)
        if current > limit:
            raise AppException(status_code=429, message="too many requests")
    except RedisError:
        _check_memory_rate_limit(key, limit=limit, window_seconds=window_seconds)


def _check_memory_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    import time

    now = time.time()
    _prune_memory_buckets(now)
    count, expires_at = _MEMORY_BUCKETS.get(key, (0, now + window_seconds))
    if expires_at <= now:
        count = 0
        expires_at = now + window_seconds
    count += 1
    _MEMORY_BUCKETS[key] = (count, expires_at)
    if count > limit:
        raise AppException(status_code=429, message="too many requests")


def _prune_memory_buckets(now: float) -> None:
    if len(_MEMORY_BUCKETS) < 10_000:
        return
    for key, (_, expires_at) in list(_MEMORY_BUCKETS.items()):
        if expires_at <= now:
            _MEMORY_BUCKETS.pop(key, None)
