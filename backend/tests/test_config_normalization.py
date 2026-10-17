"""Tests for database URL normalization and production import resolution."""

import os
from unittest.mock import patch

from app.config import Settings, normalize_database_url


class TestDatabaseUrlNormalization:
    """Verify URL scheme normalization across various PostgreSQL formats."""

    def test_postgres_scheme_converts_to_asyncpg(self) -> None:
        raw = "postgres://fleet_user:secret_pass@db.render.internal:5432/fleet_prod"
        expected = "postgresql+asyncpg://fleet_user:secret_pass@db.render.internal:5432/fleet_prod"
        assert normalize_database_url(raw) == expected

    def test_postgresql_scheme_converts_to_asyncpg(self) -> None:
        raw = "postgresql://fleet_user:secret_pass@ep-cool-frog.neon.tech:5432/fleet_prod"
        expected = (
            "postgresql+asyncpg://fleet_user:secret_pass@ep-cool-frog.neon.tech:5432/fleet_prod"
        )
        assert normalize_database_url(raw) == expected

    def test_asyncpg_scheme_remains_unchanged(self) -> None:
        raw = "postgresql+asyncpg://fleet_user:secret_pass@localhost:5432/fleetmaint"
        assert normalize_database_url(raw) == raw

    def test_psycopg_scheme_remains_unchanged(self) -> None:
        raw = "postgresql+psycopg://fleet_user:secret_pass@localhost:5432/fleetmaint"
        assert normalize_database_url(raw) == raw

    def test_preserves_ssl_and_query_parameters(self) -> None:
        raw = "postgres://user:pass@host:5432/db?ssl=require&sslmode=require&connect_timeout=10"
        expected = "postgresql+asyncpg://user:pass@host:5432/db?ssl=require&sslmode=require&connect_timeout=10"
        assert normalize_database_url(raw) == expected

    def test_preserves_url_encoded_credentials(self) -> None:
        raw = "postgres://user%40domain:p%40ss%23word@host.cloud.com:5432/db_name"
        expected = (
            "postgresql+asyncpg://user%40domain:p%40ss%23word@host.cloud.com:5432/db_name"
        )
        assert normalize_database_url(raw) == expected

    def test_empty_or_none_handling(self) -> None:
        assert normalize_database_url("") == ""

    def test_settings_validates_and_normalizes_env_vars(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgres://render_user:render_pw@dpg-xyz.render.com/fleetmaint",
                "TEST_DATABASE_URL": "postgresql://test_user:test_pw@localhost:5432/test_db",
            },
            clear=False,
        ):
            settings = Settings()
            assert settings.database_url == (
                "postgresql+asyncpg://render_user:render_pw@dpg-xyz.render.com/fleetmaint"
            )
            assert settings.effective_test_database_url == (
                "postgresql+asyncpg://test_user:test_pw@localhost:5432/test_db"
            )


class TestProductionImports:
    """Verify that backend entrypoint properly configures module resolution for ML."""

    def test_backend_and_ml_imports_succeed(self) -> None:
        # Importing app.main should ensure root directory is in sys.path
        import app.main  # noqa: F401

        # Root-level ml packages should now import without ModuleNotFoundError
        import ml.config
        from ml.models.persistence import load_model_artifact

        assert ml.config.MODELS_DIR.exists()
        assert callable(load_model_artifact)
