"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";

import { stockQueryKeys } from "@plugins/inventory/stock/constants";
import { getStockAvailability } from "@plugins/inventory/stock/services/stock.service";

import type { StockAvailability } from "@plugins/inventory/stock/types";

/** The API refuses more ids than this in one read. */
export const STOCK_AVAILABILITY_MAX_IDS = 500;

/**
 * On hand and available stock of the given items, keyed by item id. Idle while `enabled` is
 * false or there is no item, so a reader without `stock:availability` sends no request.
 */
export function useStockAvailability(
  itemIds: readonly number[],
  enabled = true,
) {
  // One sorted, distinct list: the same items in another order reuse the cached answer.
  const ids = useMemo(
    () =>
      [...new Set(itemIds)]
        .sort((a, b) => a - b)
        .slice(0, STOCK_AVAILABILITY_MAX_IDS),
    [itemIds],
  );

  const query = useQuery({
    queryKey: stockQueryKeys.availability(ids),
    queryFn: () => getStockAvailability(ids),
    enabled: enabled && ids.length > 0,
    staleTime: DEFAULT_LIST_STALE_MS,
  });

  const byItem = useMemo(
    () =>
      new Map<number, StockAvailability>(
        (query.data ?? []).map((row) => [row.itemId, row]),
      ),
    [query.data],
  );

  return { ...query, byItem };
}
