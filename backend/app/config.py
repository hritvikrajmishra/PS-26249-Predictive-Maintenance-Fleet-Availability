from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=[ROOT_DIR / ".env", ".env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://fleetmaint:fleetmaint@localhost:5432/fleetmaint",
        description="Async PostgreSQL connection string",
    )
    database_url_test: str = Field(
        default="postgresql+asyncpg://fleetmaint:fleetmaint@localhost:5432/fleetmaint_test",
        description="Async PostgreSQL connection string for testing",
    )
    test_database_url: str | None = Field(
        default=None,
        description="Alias for database_url_test (supports TEST_DATABASE_URL env var)",
    )

    @property
    def normalized_database_url(self) -> str:
        """Ensure the URL has postgresql+asyncpg:// driver and removes unsupported query params."""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        for param in [
            "?pgbouncer=true",
            "&pgbouncer=true",
            "?sslmode=require",
            "&sslmode=require",
            "?sslmode=prefer",
            "&sslmode=prefer",
            "?ssl=require",
            "&ssl=require",
        ]:
            url = url.replace(param, "")

        if url.endswith("?"):
            url = url[:-1]

        return url

    @property
    def effective_test_database_url(self) -> str:
        return self.test_database_url or self.database_url_test

    # Server
    api_host: str = Field(default="127.0.0.1", description="Host interface to bind")
    api_port: int = Field(default=8000, description="Port to bind")
    environment: str = Field(default="development", description="Runtime environment")

    # Security & CORS
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description="Allowed CORS origin URLs",
    )
    secret_key: str = Field(
        default="dev_secret_key_fleetmaint_decision_support_phase0",
        description="Secret key for JWT tokens",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
