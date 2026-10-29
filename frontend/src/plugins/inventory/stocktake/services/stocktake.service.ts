import api from "@/kernel/core/api/api";

import { stocktakeApiRoutes } from "@plugins/inventory/stocktake/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type { StocktakeAction } from "@plugins/inventory/stocktake/constants";
import type {
  LocationOption,
  StocktakeDetail,
  StocktakeInput,
  StocktakeRow,
} from "@plugins/inventory/stocktake/types";

export async function getStocktakes(
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<PaginatedResponse<StocktakeRow>> {
  const { data } = await api.get<PaginatedResponse<StocktakeRow>>(
    stocktakeApiRoutes.list,
    { params },
  );
  return data;
}

export async function getStocktake(id: number): Promise<StocktakeDetail> {
  const { data } = await api.get<StocktakeDetail>(stocktakeApiRoutes.detail(id));
  return data;
}

export async function createStocktake(
  payload: StocktakeInput,
): Promise<StocktakeDetail> {
  const { data } = await api.post<StocktakeDetail>(
    stocktakeApiRoutes.list,
    payload,
  );
  return data;
}

/** Counts one more of the scanned item; a 404 when no active item has the code. */
export async function scanStocktake(
  id: number,
  code: string,
): Promise<StocktakeDetail> {
  const { data } = await api.post<StocktakeDetail>(stocktakeApiRoutes.scan(id), {
    code,
  });
  return data;
}

export async function setStocktakeCount(
  id: number,
  itemId: number,
  countedQty: number,
): Promise<StocktakeDetail> {
  const { data } = await api.patch<StocktakeDetail>(
    stocktakeApiRoutes.line(id, itemId),
    { countedQty },
  );
  return data;
}

/** Submit and approve take no body; reject and cancel carry their reason. */
export async function runStocktakeAction(
  id: number,
  action: StocktakeAction,
  reason?: string,
): Promise<StocktakeDetail> {
  const { data } = await api.post<StocktakeDetail>(
    stocktakeApiRoutes.action(id, action),
    reason === undefined ? {} : { reason },
  );
  return data;
}

/** The locations a count may cover. */
export async function getLocations(): Promise<LocationOption[]> {
  const { data } = await api.get<{ data: LocationOption[] }>(
    stocktakeApiRoutes.locations,
    { params: { limit: 200 } },
  );
  return data.data;
}
