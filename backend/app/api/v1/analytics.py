from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.rate_limit import check_rate_limit
from app.core.response import api_success
from app.models.user import User
from app.schemas.analytics import ProductEventAck, ProductEventCreate, ProductEventSummary
from app.services.analytics_service import record_product_event, summarize_product_events

router = APIRouter(prefix="/analytics", tags=["analytics"])

ANALYTICS_RATE_WINDOW_SECONDS = 300
ANALYTICS_EVENT_RATE_LIMIT = 300
ANALYTICS_READ_RATE_LIMIT = 120


def _check_analytics_rate_limit(
    request: Request,
    current_user: User,
    *,
    scope: str,
    limit: int,
) -> None:
    check_rate_limit(
        request,
        scope=scope,
        identifier=str(current_user.id),
        limit=limit,
        window_seconds=ANALYTICS_RATE_WINDOW_SECONDS,
    )


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
def create_product_event(
    request: Request,
    payload: ProductEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_analytics_rate_limit(
        request,
        current_user,
        scope="analytics:events",
        limit=ANALYTICS_EVENT_RATE_LIMIT,
    )
    event = record_product_event(db, current_user, payload)
    return api_success(
        ProductEventAck(accepted=True, event_id=event.id),
        status_code=status.HTTP_202_ACCEPTED,
    )


@router.get("/summary")
def read_product_event_summary(
    request: Request,
    days: int = Query(default=30, ge=1, le=366),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_analytics_rate_limit(
        request,
        current_user,
        scope="analytics:summary",
        limit=ANALYTICS_READ_RATE_LIMIT,
    )
    return api_success(
        ProductEventSummary.model_validate(
            summarize_product_events(db, current_user, days=days),
        ),
    )
