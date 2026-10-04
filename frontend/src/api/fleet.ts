import { api } from './client';
import type {
  AircraftDetailOut,
  AircraftListOut,
  ComponentOut,
  ComponentTypeOut,
  PaginatedResponse,
  SystemOut,
} from '../types/api';

export const fleetApi = {
  listAircraft: (params?: { state?: string; base?: string; page?: number; page_size?: number }) =>
    api.get<PaginatedResponse<AircraftListOut>>('/fleet/aircraft', params),

  getAircraftDetail: (id: string) =>
    api.get<AircraftDetailOut>(`/fleet/aircraft/${id}`),

  listSystems: () =>
    api.get<SystemOut[]>('/fleet/systems'),

  listComponentTypes: (params?: { system_id?: string }) =>
    api.get<ComponentTypeOut[]>('/fleet/component-types', params),

  listComponents: (params?: { aircraft_id?: string; status?: string; page?: number; page_size?: number }) =>
    api.get<PaginatedResponse<ComponentOut>>('/fleet/components', params),
};
