import api from "@/kernel/core/api/api";

import { stockApiRoutes } from "@plugins/inventory/stock/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  StockAvailability,
  StockListParams,
  StockMovement,
  StockRow,
} from "@plugins/inventory/stock/types";

export async function getStock(
  params: StockListParams = {},
): Promise<PaginatedResponse<StockRow>> {
  const { data } = await api.get<PaginatedResponse<StockRow>>(
    stockApiRoutes.list,
    { params },
  );
  return data;
}

export async function getStockMovements(
  itemId: number,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<StockMovement>> {
  const { data } = await api.get<PaginatedResponse<StockMovement>>(
    stockApiRoutes.movements(itemId),
    { params },
  );
  return data;
}

/** Deleted or unknown ids are simply missing from the answer. */
export async function getStockAvailability(
  itemIds: readonly number[],
): Promise<StockAvailability[]> {
  const { data } = await api.get<StockAvailability[]>(
    stockApiRoutes.availability,
    { params: { itemIds: itemIds.join(",") } },
  );
  return data;
}
