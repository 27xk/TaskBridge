from fastapi import Request
from redis.exceptions import RedisError

from app.core.exceptions import AppException
from app.core.redis import get_redis_client


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
        return
