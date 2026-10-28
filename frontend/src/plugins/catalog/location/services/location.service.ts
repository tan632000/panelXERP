import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";

import { locationApiRoutes } from "@plugins/catalog/location/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateLocationDto,
  Location,
  LocationListParams,
  UpdateLocationDto,
} from "@plugins/catalog/location/types";

export async function getLocations(
  params: LocationListParams = {},
): Promise<PaginatedResponse<Location>> {
  const { data } = await api.get<PaginatedResponse<Location>>(
    locationApiRoutes.list,
    { params },
  );
  return data;
}

export async function createLocation(
  payload: CreateLocationDto,
): Promise<Location> {
  const { data } = await api.post<Location>(locationApiRoutes.list, payload);
  return data;
}

export async function updateLocation(
  id: number,
  payload: UpdateLocationDto,
): Promise<Location> {
  const { data } = await api.patch<Location>(
    locationApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function deleteLocation(id: number): Promise<void> {
  await api.delete(locationApiRoutes.detail(id));
}

export function bulkDeleteLocations(ids: number[]): Promise<BulkDeleteResult> {
  return requestBulkDelete(locationApiRoutes.bulkDelete, ids);
}
