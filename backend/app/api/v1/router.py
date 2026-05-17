from fastapi import APIRouter

from app.core.config import settings
from app.core.response import api_success
from app.api.v1 import auth, devices, sync, tasks

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(tasks.router)
api_router.include_router(devices.router)
api_router.include_router(sync.router)


@api_router.get("/status", tags=["status"])
def read_api_status():
    return api_success(
        {
            "status": "ok",
            "service": settings.app_name,
            "version": settings.app_version,
        },
    )
