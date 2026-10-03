import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.database import check_database_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fleetmaint")

settings = get_settings()

app = FastAPI(
    title="Integrated Predictive Maintenance & Fleet Availability Platform",
    description="Decision-support platform for aircraft health, maintenance planning, and fleet availability (Synthetic Data).",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
