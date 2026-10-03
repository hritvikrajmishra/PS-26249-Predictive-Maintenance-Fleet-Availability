"""Maintenance, work orders, agencies, and scheduled tasks service."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maintenance import Agency, MaintenanceEvent, ScheduledTask, WorkOrder
from app.schemas.common import PaginatedResponse
from app.schemas.maintenance import (
    AgencyOut,
    MaintenanceEventOut,
    ScheduledTaskOut,
    WorkOrderOut,
)


async def list_work_orders(
    session: AsyncSession,
    status: str | None = None,
    agency_id: str | None = None,
    aircraft_id: str | None = None,
    priority: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> PaginatedResponse[WorkOrderOut]:
    """List maintenance work orders with filtering and pagination."""
    stmt = select(WorkOrder)

    if status:
        stmt = stmt.where(WorkOrder.status == status)
    if agency_id:
        stmt = stmt.where(WorkOrder.agency_id == agency_id)
    if aircraft_id:
        stmt = stmt.where(WorkOrder.aircraft_id == aircraft_id)
    if priority:
        stmt = stmt.where(WorkOrder.priority == priority)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await session.execute(count_stmt)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    stmt = stmt.order_by(WorkOrder.opened.desc()).offset(offset).limit(page_size)
    res = await session.execute(stmt)
    items = [WorkOrderOut.model_validate(wo) for wo in res.scalars().all()]

    pages = (total + page_size - 1) // page_size if total > 0 else 1
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


async def list_maintenance_events(
    session: AsyncSession,
    aircraft_id: str | None = None,
    component_id: str | None = None,
    type_: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> PaginatedResponse[MaintenanceEventOut]:
    """List maintenance events with filtering and pagination."""
    stmt = select(MaintenanceEvent)

    if aircraft_id:
        stmt = stmt.where(MaintenanceEvent.aircraft_id == aircraft_id)
    if component_id:
        stmt = stmt.where(MaintenanceEvent.component_id == component_id)
    if type_:
        stmt = stmt.where(MaintenanceEvent.type == type_)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await session.execute(count_stmt)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    stmt = stmt.order_by(MaintenanceEvent.start.desc()).offset(offset).limit(page_size)
    res = await session.execute(stmt)
    items = [MaintenanceEventOut.model_validate(me) for me in res.scalars().all()]

    pages = (total + page_size - 1) // page_size if total > 0 else 1
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


async def list_agencies(session: AsyncSession) -> list[AgencyOut]:
    """List all internal and external maintenance agencies / workshops."""
    stmt = select(Agency).order_by(Agency.agency_id)
    res = await session.execute(stmt)
    return [AgencyOut.model_validate(a) for a in res.scalars().all()]


async def list_scheduled_tasks(
    session: AsyncSession, aircraft_id: str | None = None
) -> list[ScheduledTaskOut]:
    """List scheduled compliance inspection tasks."""
    stmt = select(ScheduledTask)
    if aircraft_id:
        stmt = stmt.where(ScheduledTask.aircraft_id == aircraft_id)
    stmt = stmt.order_by(ScheduledTask.task_id)
    res = await session.execute(stmt)
    return [ScheduledTaskOut.model_validate(st) for st in res.scalars().all()]
