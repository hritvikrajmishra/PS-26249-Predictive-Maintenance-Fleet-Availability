"""FastAPI application entrypoint for Integrated Predictive Maintenance Platform."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.config import get_settings
from app.core.database import check_database_connection, get_session_factory
from app.core.errors import register_exception_handlers
from app.core.logging import setup_logging
from app.services.auth_service import ensure_demo_users_exist

setup_logging(level="INFO")
logger = logging.getLogger("fleetmaint")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for database initialization and demo user provisioning."""
    logger.info("Initializing backend services...")
    try:
        session_factory = get_session_factory()
        async with session_factory() as session:
            await ensure_demo_users_exist(session)
    except Exception as exc:
        logger.warning(f"Demo user check skipped on startup: {exc}")

    yield
    logger.info("Shutting down backend services...")


app = FastAPI(
    title="Integrated Predictive Maintenance & Fleet Availability Platform",
    description="Decision-support platform for aircraft health, maintenance planning, and fleet availability (Synthetic Data).",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Register uniform exception handlers
register_exception_handlers(app)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API v1 endpoints
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, Any]:
    """Check health of the backend API and verify PostgreSQL connectivity."""
    db_result = await check_database_connection()
    is_db_connected = db_result["status"] == "connected"

    overall_status = "healthy" if is_db_connected else "degraded"

    return {
        "status": overall_status,
        "backend": "ok",
        "database": db_result["status"],
        "database_detail": db_result.get("error"),
        "environment": settings.environment,
        "synthetic_data": True,
        "version": "0.1.0",
    }
