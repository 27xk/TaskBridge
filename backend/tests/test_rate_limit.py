from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.core import rate_limit
from app.core.exceptions import AppException
from app.core.rate_limit import check_rate_limit
from tests.conftest import auth_headers


def test_rate_limit_uses_memory_fallback_when_redis_is_unavailable(monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())

    app = FastAPI()

    @app.get("/limited")
    def limited(request: Request):
        check_rate_limit(
            request,
            scope="test",
            identifier="same-user",
            limit=2,
            window_seconds=60,
        )
        return {"ok": True}

    @app.exception_handler(AppException)
    def handle_app_exception(_, exc: AppException):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.status_code, "message": exc.message, "data": None},
        )

    with TestClient(app) as client:
        assert client.get("/limited").status_code == 200
        assert client.get("/limited").status_code == 200
        response = client.get("/limited")

    assert response.status_code == 429
    assert response.json()["message"] == "too many requests"


def test_rate_limit_fails_closed_in_production_when_redis_is_unavailable(monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr(rate_limit.settings, "environment", "production")

    app = FastAPI()

    @app.get("/limited")
    def limited(request: Request):
        check_rate_limit(
            request,
            scope="production",
            identifier="same-user",
            limit=2,
            window_seconds=60,
        )
        return {"ok": True}

    @app.exception_handler(AppException)
    def handle_app_exception(_, exc: AppException):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.status_code, "message": exc.message, "data": None},
        )

    with TestClient(app) as client:
        response = client.get("/limited")

    assert response.status_code == 503
    assert response.json()["message"] == "rate limit unavailable"


def test_memory_rate_limit_fallback_is_bounded(monkeypatch) -> None:
    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr(rate_limit, "_MAX_MEMORY_BUCKETS", 3)

    for index in range(10):
        rate_limit._check_memory_rate_limit(
            f"key-{index}",
            limit=100,
            window_seconds=60,
        )

    assert len(rate_limit._MEMORY_BUCKETS) <= 3


def test_rate_limit_uses_forwarded_ip_only_from_trusted_proxy(monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr(rate_limit.settings, "trusted_proxy_ips", "testclient")

    app = FastAPI()

    @app.get("/limited")
    def limited(request: Request):
        check_rate_limit(
            request,
            scope="proxy",
            identifier="same-user",
            limit=1,
            window_seconds=60,
        )
        return {"ok": True}

    @app.exception_handler(AppException)
    def handle_app_exception(_, exc: AppException):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.status_code, "message": exc.message, "data": None},
    )

    with TestClient(app) as client:
        first = client.get("/limited", headers={"X-Forwarded-For": "203.0.113.10"})
        repeated = client.get("/limited", headers={"X-Forwarded-For": "203.0.113.10"})
        other_ip = client.get("/limited", headers={"X-Forwarded-For": "203.0.113.11"})

    assert first.status_code == 200
    assert repeated.status_code == 429
    assert other_ip.status_code == 200


def test_rate_limit_ignores_forwarded_ip_from_untrusted_proxy(monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr(rate_limit.settings, "trusted_proxy_ips", "")

    app = FastAPI()

    @app.get("/limited")
    def limited(request: Request):
        check_rate_limit(
            request,
            scope="proxy-untrusted",
            identifier="same-user",
            limit=1,
            window_seconds=60,
        )
        return {"ok": True}

    @app.exception_handler(AppException)
    def handle_app_exception(_, exc: AppException):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.status_code, "message": exc.message, "data": None},
    )

    with TestClient(app) as client:
        first = client.get("/limited", headers={"X-Forwarded-For": "203.0.113.10"})
        other_ip = client.get("/limited", headers={"X-Forwarded-For": "203.0.113.11"})

    assert first.status_code == 200
    assert other_ip.status_code == 429


def test_api_rate_limit_response_includes_retry_after(client, monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())

    payload = {
        "username_or_email": "retry-after@example.com",
        "password": "wrong-password",
        "device_id": "retry-after-device",
    }

    for _ in range(20):
        response = client.post("/api/v1/auth/login", json=payload)
        assert response.status_code == 401

    response = client.post("/api/v1/auth/login", json=payload)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "300"


def test_redis_rate_limit_retry_after_uses_remaining_ttl(monkeypatch) -> None:
    class LimitedRedis:
        def incr(self, key: str) -> int:
            return 21

        def expire(self, key: str, seconds: int) -> None:
            raise AssertionError("existing limited bucket should already have a TTL")

        def ttl(self, key: str) -> int:
            return 17

    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: LimitedRedis())

    app = FastAPI()

    @app.get("/limited")
    def limited(request: Request):
        check_rate_limit(
            request,
            scope="redis-ttl",
            identifier="same-user",
            limit=20,
            window_seconds=300,
        )
        return {"ok": True}

    @app.exception_handler(AppException)
    def handle_app_exception(_, exc: AppException):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={"code": exc.status_code, "message": exc.message, "data": None},
        )

    with TestClient(app) as client:
        response = client.get("/limited")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "17"


def test_redis_rate_limit_retry_after_does_not_extend_expiring_bucket(monkeypatch) -> None:
    expire_calls = 0

    class ExpiringRedis:
        def incr(self, key: str) -> int:
            return 21

        def expire(self, key: str, seconds: int) -> None:
            nonlocal expire_calls
            expire_calls += 1

        def ttl(self, key: str) -> int:
            return 0

    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: ExpiringRedis())

    app = FastAPI()

    @app.get("/limited")
    def limited(request: Request):
        check_rate_limit(
            request,
            scope="redis-ttl-zero",
            identifier="same-user",
            limit=20,
            window_seconds=300,
        )
        return {"ok": True}

    @app.exception_handler(AppException)
    def handle_app_exception(_, exc: AppException):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={"code": exc.status_code, "message": exc.message, "data": None},
        )

    with TestClient(app) as client:
        response = client.get("/limited")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "1"
    assert expire_calls == 0


def test_task_list_endpoint_is_rate_limited(client, monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    headers = auth_headers(client, "task-limit-user", "task-limit-user@example.com")
    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr("app.api.v1.tasks.TASK_READ_RATE_LIMIT", 2)
    monkeypatch.setattr("app.api.v1.tasks.TASK_RATE_WINDOW_SECONDS", 300)

    assert client.get("/api/v1/tasks", headers=headers).status_code == 200
    assert client.get("/api/v1/tasks", headers=headers).status_code == 200
    response = client.get("/api/v1/tasks", headers=headers)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "300"


def test_blank_task_search_uses_list_rate_limit(client, monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    headers = auth_headers(client, "blank-search-user", "blank-search-user@example.com")
    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr("app.api.v1.tasks.TASK_READ_RATE_LIMIT", 2)
    monkeypatch.setattr("app.api.v1.tasks.TASK_SEARCH_RATE_LIMIT", 1)
    monkeypatch.setattr("app.api.v1.tasks.TASK_RATE_WINDOW_SECONDS", 300)

    assert client.get("/api/v1/tasks", headers=headers, params={"q": "   "}).status_code == 200
    assert client.get("/api/v1/tasks", headers=headers, params={"q": "\t"}).status_code == 200
    response = client.get("/api/v1/tasks", headers=headers, params={"q": "   "})

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "300"


def test_task_write_endpoint_is_rate_limited(client, monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    headers = auth_headers(client, "task-write-user", "task-write-user@example.com")
    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr("app.api.v1.tasks.TASK_WRITE_RATE_LIMIT", 2)
    monkeypatch.setattr("app.api.v1.tasks.TASK_RATE_WINDOW_SECONDS", 300)

    payload = {"title": "Write me"}
    assert client.post("/api/v1/tasks", headers=headers, json=payload).status_code == 201
    assert client.post("/api/v1/tasks", headers=headers, json=payload).status_code == 201
    response = client.post("/api/v1/tasks", headers=headers, json=payload)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "300"


def test_task_export_endpoint_is_rate_limited(client, monkeypatch) -> None:
    class BrokenRedis:
        def incr(self, key: str) -> int:
            raise RedisError("redis unavailable")

        def expire(self, key: str, seconds: int) -> None:
            raise RedisError("redis unavailable")

    headers = auth_headers(client, "task-export-user", "task-export-user@example.com")
    rate_limit._MEMORY_BUCKETS.clear()
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: BrokenRedis())
    monkeypatch.setattr("app.api.v1.tasks.TASK_EXPORT_RATE_LIMIT", 2)
    monkeypatch.setattr("app.api.v1.tasks.TASK_RATE_WINDOW_SECONDS", 300)

    assert client.get("/api/v1/tasks/export", headers=headers).status_code == 200
    assert client.get("/api/v1/tasks/export", headers=headers).status_code == 200
    response = client.get("/api/v1/tasks/export", headers=headers)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "300"
