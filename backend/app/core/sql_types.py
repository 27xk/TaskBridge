from sqlalchemy import DateTime
from sqlalchemy.dialects.mysql import DATETIME


def precise_datetime():
    """Sync watermarks require microseconds on MySQL as well as SQLite."""
    return DateTime(timezone=False).with_variant(DATETIME(fsp=6), "mysql")
