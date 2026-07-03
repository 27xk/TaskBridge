from ipaddress import ip_address, ip_network
from math import ceil

from fastapi import Request
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.redis import get_redis_client

_MEMORY_BUCKETS: dict[str, tuple[int, float]] = {}
_MAX_MEMORY_BUCKETS = 10_000


def check_rate_limit(
    request: Request,
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> None:
    client_host = get_rate_limit_client_host(request)
    normalized_identifier = identifier.strip().lower()[:128] or "anonymous"
    key = f"taskbridge:rate:{scope}:{client_host}:{normalized_identifier}"

    try:
        redis = get_redis_client()
        current = redis.incr(key)
        if current == 1:
            redis.expire(key, window_seconds)
        if current > limit:
            retry_after_seconds = _redis_retry_after_seconds(redis, key, window_seconds)
            _raise_rate_limit_exceeded(retry_after_seconds)
    except RedisError as exc:
        if settings.is_production:
            raise AppException(status_code=503, message="rate limit unavailable") from exc
        _check_memory_rate_limit(key, limit=limit, window_seconds=window_seconds)


def get_rate_limit_client_host(request: Request) -> str:
    client_host = request.client.host if request.client else "unknown"
    if not _is_trusted_proxy(client_host):
        return client_host

    forwarded_for = request.headers.get("x-forwarded-for", "")
    forwarded_host = _first_forwarded_host(forwarded_for)
    if forwarded_host:
        return forwarded_host

    real_ip = request.headers.get("x-real-ip", "").strip()
    return real_ip if _is_valid_ip(real_ip) else client_host


def _first_forwarded_host(value: str) -> str | None:
    for part in value.split(","):
        candidate = part.strip()
        if _is_valid_ip(candidate):
            return candidate
    return None


def _is_trusted_proxy(client_host: str) -> bool:
    for raw_proxy in settings.trusted_proxy_ips.split(","):
        proxy = raw_proxy.strip()
        if not proxy:
            continue
        if proxy == "*" or proxy == client_host:
            return True
        try:
            if ip_address(client_host) in ip_network(proxy, strict=False):
                return True
        except ValueError:
            continue
    return False


def _is_valid_ip(value: str) -> bool:
    if not value:
        return False
    try:
        ip_address(value)
    except ValueError:
        return False
    return True


def _check_memory_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    import time

    now = time.time()
    _prune_memory_buckets(now)
    if key not in _MEMORY_BUCKETS and len(_MEMORY_BUCKETS) >= _MAX_MEMORY_BUCKETS:
        _evict_oldest_bucket()
    count, expires_at = _MEMORY_BUCKETS.get(key, (0, now + window_seconds))
    if expires_at <= now:
        count = 0
        expires_at = now + window_seconds
    count += 1
    _MEMORY_BUCKETS[key] = (count, expires_at)
    if count > limit:
        retry_after_seconds = max(1, ceil(expires_at - now))
        _raise_rate_limit_exceeded(retry_after_seconds)


def _prune_memory_buckets(now: float) -> None:
    if len(_MEMORY_BUCKETS) < _MAX_MEMORY_BUCKETS:
        return
    for key, (_, expires_at) in list(_MEMORY_BUCKETS.items()):
        if expires_at <= now:
            _MEMORY_BUCKETS.pop(key, None)
    while len(_MEMORY_BUCKETS) > _MAX_MEMORY_BUCKETS:
        _evict_oldest_bucket()


def _evict_oldest_bucket() -> None:
    if not _MEMORY_BUCKETS:
        return
    oldest_key = min(_MEMORY_BUCKETS, key=lambda bucket_key: _MEMORY_BUCKETS[bucket_key][1])
    _MEMORY_BUCKETS.pop(oldest_key, None)


def _raise_rate_limit_exceeded(retry_after_seconds: int) -> None:
    raise AppException(
        status_code=429,
        message="too many requests",
        headers={"Retry-After": str(max(1, retry_after_seconds))},
    )


def _redis_retry_after_seconds(redis, key: str, window_seconds: int) -> int:
    try:
        ttl = int(redis.ttl(key))
    except (AttributeError, TypeError, ValueError, RedisError):
        return window_seconds
    if ttl > 0:
        return ttl
    if ttl == 0:
        return 1
    try:
        redis.expire(key, window_seconds)
    except RedisError:
        pass
    return window_seconds
