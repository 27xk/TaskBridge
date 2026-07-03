from functools import lru_cache
from typing import Literal

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


@lru_cache
def get_redis_client() -> Redis:
    return Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=0.2,
        socket_timeout=0.2,
    )


def redis_health_status() -> Literal["ok", "degraded"]:
    try:
        get_redis_client().ping()
    except RedisError:
        return "degraded"
    return "ok"
