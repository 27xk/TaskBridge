from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Asia/Shanghai"
SHANGHAI_TZ = ZoneInfo(DEFAULT_TIMEZONE)


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def normalize_to_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def utc_iso(value: datetime | None = None) -> str:
    normalized = value or utc_now()
    if normalized.tzinfo is None:
        normalized = normalized.replace(tzinfo=UTC)
    else:
        normalized = normalized.astimezone(UTC)
    return normalized.isoformat().replace("+00:00", "Z")


def resolve_timezone(timezone_name: str = DEFAULT_TIMEZONE) -> ZoneInfo:
    normalized = timezone_name.strip()
    if not normalized:
        raise ValueError("invalid timezone")
    try:
        return ZoneInfo(normalized)
    except ZoneInfoNotFoundError as error:
        raise ValueError("invalid timezone") from error


def local_date(value: datetime | None = None, timezone_name: str = DEFAULT_TIMEZONE) -> date:
    normalized = value or utc_now()
    if normalized.tzinfo is None:
        normalized = normalized.replace(tzinfo=UTC)
    else:
        normalized = normalized.astimezone(UTC)
    return normalized.astimezone(resolve_timezone(timezone_name)).date()


def day_utc_bounds(
    day: date,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=resolve_timezone(timezone_name))
    end = start + timedelta(days=1)
    return (
        start.astimezone(UTC).replace(tzinfo=None),
        end.astimezone(UTC).replace(tzinfo=None),
    )


def shanghai_local_date(value: datetime | None = None) -> date:
    return local_date(value, DEFAULT_TIMEZONE)


def shanghai_day_utc_bounds(day: date) -> tuple[datetime, datetime]:
    return day_utc_bounds(day, DEFAULT_TIMEZONE)
