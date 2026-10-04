import { api } from './client';
import type {
  AgencyOut,
  MaintenanceEventOut,
  PaginatedResponse,
  ScheduledTaskOut,
  WorkOrderOut,
} from '../types/api';

export const maintenanceApi = {
  listWorkOrders: (params?: {
    status?: string;
    agency?: string;
    aircraft?: string;
    priority?: string;
    page?: number;
    page_size?: number;
  }) => api.get<PaginatedResponse<WorkOrderOut>>('/work-orders', params),

  listMaintenanceEvents: (params?: {
    aircraft_id?: string;
    component_id?: string;
    type?: string;
    page?: number;
    page_size?: number;
  }) => api.get<PaginatedResponse<MaintenanceEventOut>>('/maintenance/events', params),

  listAgencies: () =>
    api.get<AgencyOut[]>('/agencies'),

  listScheduledTasks: (params?: { aircraft_id?: string }) =>
    api.get<ScheduledTaskOut[]>('/scheduled-tasks', params),
};
