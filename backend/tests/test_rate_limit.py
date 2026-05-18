from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.core.exceptions import AppException
from app.core.rate_limit import check_rate_limit


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
