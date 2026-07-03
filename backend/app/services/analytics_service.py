from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product_event import ProductEvent
from app.models.user import User
from app.schemas.analytics import ProductEventCreate
from app.utils.time import normalize_to_utc_naive, utc_now

MAX_PROPERTY_KEYS = 32
MAX_PROPERTY_STRING_LENGTH = 256
MAX_PROPERTY_LIST_ITEMS = 16


def record_product_event(
    db: Session, current_user: User, payload: ProductEventCreate
) -> ProductEvent:
    event = ProductEvent(
        user_id=current_user.id,
        name=payload.name,
        source=payload.source,
        route=_normalize_optional_text(payload.route),
        app_version=_normalize_optional_text(payload.app_version),
        device_id=_normalize_optional_text(payload.device_id),
        session_id=_normalize_optional_text(payload.session_id),
        properties=_sanitize_properties(payload.properties),
        occurred_at=normalize_to_utc_naive(payload.occurred_at) if payload.occurred_at else utc_now(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def summarize_product_events(db: Session, current_user: User, *, days: int) -> dict[str, Any]:
    since = utc_now() - timedelta(days=days)
    conditions = [ProductEvent.user_id == current_user.id, ProductEvent.created_at >= since]

    total_count = int(
        db.scalar(select(func.count(ProductEvent.id)).where(*conditions)) or 0,
    )
    event_rows = db.execute(
        select(ProductEvent.name, func.count(ProductEvent.id))
        .where(*conditions)
        .group_by(ProductEvent.name)
        .order_by(ProductEvent.name),
    ).all()
    source_rows = db.execute(
        select(ProductEvent.source, func.count(ProductEvent.id))
        .where(*conditions)
        .group_by(ProductEvent.source)
        .order_by(ProductEvent.source),
    ).all()
    return {
        "total_count": total_count,
        "days": days,
        "events": [{"name": name, "count": int(count)} for name, count in event_rows],
        "sources": [{"source": source, "count": int(count)} for source, count in source_rows],
    }


def _normalize_optional_text(value: str | None) -> str | None:
    normalized = value.strip() if value else None
    return normalized or None


def _sanitize_properties(properties: dict[str, Any]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for raw_key, raw_value in list(properties.items())[:MAX_PROPERTY_KEYS]:
        key = str(raw_key).strip()[:64]
        if not key:
            continue
        sanitized[key] = _sanitize_property_value(raw_value)
    return sanitized


def _sanitize_property_value(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        return value[:MAX_PROPERTY_STRING_LENGTH]
    if isinstance(value, list):
        return [_sanitize_property_value(item) for item in value[:MAX_PROPERTY_LIST_ITEMS]]
    return str(value)[:MAX_PROPERTY_STRING_LENGTH]
