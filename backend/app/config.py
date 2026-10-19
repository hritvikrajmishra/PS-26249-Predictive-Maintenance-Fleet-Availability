import urllib.parse
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def sanitize_db_url(url: str) -> str:
    """Normalize database connection string for asyncpg, Supabase poolers, and cloud PostgreSQL."""
    if not url:
        return url

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Safely handle unencoded special characters in database passwords (e.g. '@' in passwords)
    if "://" in url:
        scheme, rest = url.split("://", 1)
        if "@" in rest:
            last_at = rest.rfind("@")
            creds_part = rest[:last_at]
            host_part = rest[last_at + 1 :]
            if ":" in creds_part:
                user_part, pass_part = creds_part.split(":", 1)
                decoded_pass = urllib.parse.unquote(pass_part)
                encoded_pass = urllib.parse.quote(decoded_pass, safe="")
                url = f"{scheme}://{user_part}:{encoded_pass}@{host_part}"

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

    if "channel_binding=" in url:
        import re

        url = re.sub(r"[?&]channel_binding=[^&]*", "", url)
        if "?" not in url and "&" in url:
            url = url.replace("&", "?", 1)

    if url.endswith("?"):
        url = url[:-1]

    return url


normalize_database_url = sanitize_db_url


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

    @field_validator("database_url", "database_url_test", "test_database_url", mode="before")
    @classmethod
    def _normalize_database_urls(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return normalize_database_url(v)

    @property
    def normalized_database_url(self) -> str:
        """Ensure the URL has postgresql+asyncpg:// driver and removes unsupported query params."""
        return sanitize_db_url(self.database_url)

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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: Any) -> list[str]:
        if v is None:
            return ["http://localhost:5173", "http://127.0.0.1:5173"]
        if isinstance(v, str):
            v = v.strip()
            if v == "*":
                return ["*"]
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [part.strip() for part in v.split(",") if part.strip()]
        return v

    secret_key: str = Field(
        default="dev_secret_key_fleetmaint_decision_support_phase0",
        description="Secret key for JWT tokens",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
