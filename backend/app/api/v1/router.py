"""Main API v1 router combining all domain sub-routers."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.fleet import router as fleet_router
from app.api.v1.inventory import router as inventory_router
from app.api.v1.maintenance import router as maintenance_router
from app.api.v1.sensors import router as sensors_router

api_v1_router = APIRouter()

api_v1_router.include_router(auth_router)
api_v1_router.include_router(fleet_router)
api_v1_router.include_router(sensors_router)
api_v1_router.include_router(maintenance_router)
api_v1_router.include_router(inventory_router)
