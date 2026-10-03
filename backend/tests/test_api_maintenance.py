"""Tests for maintenance, work orders, agencies, and scheduled tasks endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def planner_auth() -> dict[str, str]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"username": "planner", "password": "planner123"},
        )
        token = res.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_list_work_orders(planner_auth: dict[str, str]):
    """Verify listing work orders with status filter and pagination."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/work-orders?page=1&page_size=20", headers=planner_auth)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 20
        assert data["total"] >= 1000
        assert "agency_id" in data["items"][0]
        assert "status" in data["items"][0]


@pytest.mark.asyncio
async def test_list_maintenance_events(planner_auth: dict[str, str]):
    """Verify listing physical maintenance events."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/maintenance/events?type=unscheduled&page_size=10", headers=planner_auth
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 10
        for item in data["items"]:
            assert item["type"] == "unscheduled"


@pytest.mark.asyncio
async def test_list_agencies(planner_auth: dict[str, str]):
    """Verify retrieving maintenance workshop agencies."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/agencies", headers=planner_auth)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 3
        agency_ids = {a["agency_id"] for a in data}
        assert "AG-LINE-01" in agency_ids
        assert "AG-BASE-01" in agency_ids
        assert "AG-DEPOT-01" in agency_ids


@pytest.mark.asyncio
async def test_list_scheduled_tasks(planner_auth: dict[str, str]):
    """Verify listing scheduled phase inspection tasks across aircraft."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/scheduled-tasks?aircraft_id=AC-017", headers=planner_auth)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 3  # A-check, B-check, C-check
