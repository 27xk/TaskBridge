from hmac import compare_digest

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import PlainTextResponse

from app.api.deps import get_db
from app.api.v1.router import api_router
from app.api.v1.websocket import router as websocket_router
from app.core.config import settings
from app.core.exceptions import AppException
from app.core.observability import (
    install_observability,
    record_task_version_conflict,
    render_prometheus_metrics,
)
from app.core.redis import redis_health_status
from app.core.response import api_error, api_success


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="TaskBridge backend API for Android and Windows desktop clients.",
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    application.add_middleware(GZipMiddleware, minimum_size=1024)
    cors_origins = settings.web_cors_origin_list
    if cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
            expose_headers=["X-Request-ID"],
            max_age=600,
        )
    install_observability(application)
    application.include_router(api_router, prefix="/api/v1")
    application.include_router(websocket_router)

    @application.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        if exc.status_code == 409 and exc.message == "version conflict":
            record_task_version_conflict()
        return api_error(
            code=exc.code,
            message=exc.message,
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @application.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_, exc: StarletteHTTPException):
        message = exc.detail if isinstance(exc.detail, str) else "request failed"
        return api_error(code=exc.status_code, message=message, status_code=exc.status_code)

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(_, exc: RequestValidationError):
        first_error = exc.errors()[0] if exc.errors() else {}
        message = str(first_error.get("msg", "validation error"))
        return api_error(code=422, message=message, status_code=422)

    @application.get("/health", tags=["health"])
    def read_health():
        return api_success(
            {
                "status": "ok",
                "service": settings.app_name,
                "version": settings.app_version,
            },
        )

    @application.get("/ready", tags=["health"])
    def read_ready(db: Session = Depends(get_db)):
        status_payload = read_dependency_status(db)
        return api_success(
            status_payload,
            message="success" if status_payload["status"] == "ready" else "service degraded",
            status_code=200 if status_payload["status"] == "ready" else 503,
        )

    @application.get("/status", tags=["health"])
    def read_status(db: Session = Depends(get_db)):
        return api_success(read_dependency_status(db))

    @application.get("/metrics", include_in_schema=False)
    def read_metrics(request: Request):
        authorize_metrics_request(request)
        return PlainTextResponse(
            render_prometheus_metrics(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    return application


def read_dependency_status(db: Session) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    redis_status = redis_health_status()
    return {
        "status": "ready" if redis_status == "ok" else "degraded",
        "database": "ok",
        "redis": redis_status,
        "service": settings.app_name,
    }


def authorize_metrics_request(request: Request) -> None:
    if not settings.metrics_enabled:
        raise AppException(status_code=404, message="metrics disabled")
    token = settings.metrics_token.strip()
    if not token:
        return
    authorization = request.headers.get("authorization", "")
    scheme, _, supplied_token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not compare_digest(supplied_token, token):
        raise AppException(status_code=401, message="invalid metrics token")


app = create_app()
