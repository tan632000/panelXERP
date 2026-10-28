"use client";

import { useQuery } from "@tanstack/react-query";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";

import { materialQueryKeys } from "@plugins/inventory/material/constants";
import {
  getMaterialOrders,
  getOrderMaterial,
} from "@plugins/inventory/material/services/material.service";

import type { MaterialOrderListParams } from "@plugins/inventory/material/types";

export function useMaterialOrders(params: MaterialOrderListParams = {}) {
  return useQuery({
    queryKey: materialQueryKeys.orders(params as Record<string, unknown>),
    queryFn: () => getMaterialOrders(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useOrderMaterial(orderId: number | null) {
  return useQuery({
    queryKey: materialQueryKeys.order(orderId ?? 0),
    queryFn: () => getOrderMaterial(orderId as number),
    enabled: orderId !== null && orderId > 0,
  });
}
