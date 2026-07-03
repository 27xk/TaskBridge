from functools import lru_cache
from ipaddress import ip_network

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me-in-production-with-at-least-32-bytes"
DEFAULT_DATABASE_URL = "mysql+pymysql://taskbridge:change-this-password@127.0.0.1:3306/taskbridge"
PRODUCTION_ENVIRONMENTS = {"production", "prod", "staging"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "TaskBridge API"
    app_version: str = "0.1.7"
    environment: str = "development"
    database_url: str = Field(
        default=DEFAULT_DATABASE_URL,
    )
    database_pool_size: int = 3
    database_max_overflow: int = 2
    database_pool_recycle_seconds: int = 1800
    redis_url: str = "redis://127.0.0.1:6379/0"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    websocket_ticket_expire_seconds: int = 60
    registration_enabled: bool = True
    metrics_enabled: bool = True
    metrics_token: str = ""
    trusted_proxy_ips: str = ""
    web_cors_origins: str = "http://127.0.0.1:8080,http://localhost:8080"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in PRODUCTION_ENVIRONMENTS

    def validate_runtime_security(self) -> None:
        if not self.is_production:
            return
        if self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be changed and contain at least 32 characters")
        if "change-this-password" in self.database_url:
            raise ValueError("DATABASE_URL must not use the default development password")
        if self.metrics_enabled and not self.metrics_token.strip():
            raise ValueError(
                "METRICS_TOKEN must be configured when metrics are enabled in production",
            )
        invalid_proxy_entries = _invalid_trusted_proxy_entries(self.trusted_proxy_ips)
        if invalid_proxy_entries:
            raise ValueError(
                "TRUSTED_PROXY_IPS must contain only '*' or IP/CIDR entries: "
                + ", ".join(invalid_proxy_entries),
            )
        if any(_is_development_origin(origin) for origin in self.web_cors_origin_list):
            raise ValueError("WEB_CORS_ORIGINS must not include localhost origins in production")
        if "*" in self.web_cors_origin_list:
            raise ValueError("WEB_CORS_ORIGINS must not use wildcard origins in production")

    @property
    def web_cors_origin_list(self) -> list[str]:
        origins: list[str] = []
        for raw_origin in self.web_cors_origins.split(","):
            origin = raw_origin.strip().rstrip("/")
            if origin and origin not in origins:
                origins.append(origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    loaded_settings = Settings()
    loaded_settings.validate_runtime_security()
    return loaded_settings


def _invalid_trusted_proxy_entries(raw_value: str) -> list[str]:
    invalid_entries: list[str] = []
    for raw_entry in raw_value.split(","):
        entry = raw_entry.strip()
        if not entry:
            continue
        if entry == "*":
            invalid_entries.append(entry)
            continue
        try:
            network = ip_network(entry, strict=False)
        except ValueError:
            invalid_entries.append(entry)
            continue
        if network.prefixlen == 0:
            invalid_entries.append(entry)
    return invalid_entries


def _is_development_origin(origin: str) -> bool:
    return origin.startswith(("http://127.0.0.1", "http://localhost", "http://0.0.0.0"))


settings = get_settings()
