"use client";

import { useQuery } from "@tanstack/react-query";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";

import {
  STOCK_LEDGER_PAGE_SIZE,
  stockQueryKeys,
} from "@plugins/inventory/stock/constants";
import {
  getStock,
  getStockMovements,
} from "@plugins/inventory/stock/services/stock.service";

import type { StockListParams } from "@plugins/inventory/stock/types";

export function useStockList(params: StockListParams = {}) {
  return useQuery({
    queryKey: stockQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getStock(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** The ledger of one item; idle until an item is picked. */
export function useStockMovements(itemId: number | null, page: number) {
  return useQuery({
    queryKey: stockQueryKeys.movements(itemId ?? 0, page),
    queryFn: () =>
      getStockMovements(itemId as number, {
        page,
        limit: STOCK_LEDGER_PAGE_SIZE,
      }),
    enabled: itemId !== null,
  });
}
