from functools import lru_cache

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
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = Field(
        default=DEFAULT_DATABASE_URL,
    )
    redis_url: str = "redis://127.0.0.1:6379/0"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

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


@lru_cache
def get_settings() -> Settings:
    loaded_settings = Settings()
    loaded_settings.validate_runtime_security()
    return loaded_settings


settings = get_settings()
