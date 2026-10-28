import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import get_current_user
from app.core.observability import record_client_error_report, request_id_context
from app.core.rate_limit import check_rate_limit
from app.core.response import api_success
from app.core.sync_health import record_sync_health
from app.models.user import User
from app.schemas.observability import ClientErrorReport, SyncHealthAcknowledgement, SyncHealthReport
from app.schemas.responses import ApiResponse, ClientErrorAcknowledgement

router = APIRouter(prefix="/observability", tags=["observability"])
logger = logging.getLogger("taskbridge.client_error")


@router.post("/sync-health", status_code=202, response_model=ApiResponse[SyncHealthAcknowledgement])
def report_sync_health(payload: SyncHealthReport, request: Request,
                       current_user: User = Depends(get_current_user)):
    check_rate_limit(request, scope="sync-health", identifier=str(current_user.id),
                     limit=120, window_seconds=300)
    record_sync_health(current_user.id, payload.source, payload.device_id,
                       payload.pending_count, payload.conflict_count,
                       payload.oldest_pending_seconds, payload.last_success_age_seconds)
    return api_success(SyncHealthAcknowledgement(), status_code=202)


@router.post("/client-error", status_code=status.HTTP_202_ACCEPTED, response_model=ApiResponse[ClientErrorAcknowledgement])
def report_client_error(
    payload: ClientErrorReport,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    report_id = str(uuid4())
    request_id = request_id_context.get()
    record_client_error_report(payload.source)
    logger.warning(
        "client error reported",
        extra={
            "report_id": report_id,
            "request_id": request_id,
            "user_id": current_user.id,
            "source": payload.source,
            "client_error_message": payload.message,
            "url": payload.url,
            "route": payload.route,
            "trace_id": payload.trace_id,
            "user_agent": payload.user_agent or request.headers.get("User-Agent", ""),
            "app_version": payload.app_version,
            "visibility_state": payload.visibility_state,
            "online": payload.online,
            "client_error_stack": payload.stack,
        },
    )
    return api_success(
        {"accepted": True, "report_id": report_id, "request_id": request_id},
        status_code=status.HTTP_202_ACCEPTED,
    )
