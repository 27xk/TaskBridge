from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.api.v1.websocket import router as websocket_router
from app.core.config import settings
from app.core.exceptions import AppException
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
    application.include_router(api_router, prefix="/api/v1")
    application.include_router(websocket_router)

    @application.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        return api_error(code=exc.code, message=exc.message, status_code=exc.status_code)

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

    return application


app = create_app()
