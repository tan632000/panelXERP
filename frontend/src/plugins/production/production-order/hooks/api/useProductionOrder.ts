"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { materialQueryKeys } from "@plugins/inventory/material/constants";
import { productionOrderQueryKeys } from "@plugins/production/production-order/constants";
import {
  cancelProductionOrder,
  createProductionOrder,
  getOpenOrders,
  getProductionOrder,
  getProductionOrders,
  getProductionShortage,
  getTechnicianOptions,
  releaseProductionOrder,
  updateProductionUnit,
} from "@plugins/production/production-order/services/production-order.service";
import { unitCodesFromReleaseError } from "@plugins/production/production-order/utils/release-error";
import { orderQueryKeys } from "@plugins/sales/order/constants";

import type {
  ProductionOrderDetail,
  ProductionOrderListParams,
  UnitUpdateInput,
} from "@plugins/production/production-order/types";

const TOAST = "production.toast";

/** A refused step (order not open, already has production, finished cabinet) is a 409. */
export function useOrderFeedback() {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("conflict") : undefined,
  });
}

/**
 * Stores the answered detail. A release or a cancel also moves the sales order between open and
 * in production, so those refresh the order and material views that show its status.
 */
function useStoreDetail(movesOrder = false) {
  const qc = useQueryClient();
  return (detail: ProductionOrderDetail) => {
    qc.setQueryData(productionOrderQueryKeys.detail(detail.id), detail);
    qc.invalidateQueries({ queryKey: productionOrderQueryKeys.all });
    if (movesOrder) {
      qc.invalidateQueries({ queryKey: materialQueryKeys.all });
      qc.invalidateQueries({ queryKey: orderQueryKeys.all });
    }
  };
}

export function useProductionOrderList(
  params: ProductionOrderListParams,
  enabled = true,
) {
  return useQuery({
    queryKey: productionOrderQueryKeys.list({ ...params }),
    queryFn: () => getProductionOrders(params),
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useProductionOrder(id: number | null) {
  return useQuery({
    queryKey: productionOrderQueryKeys.detail(id ?? 0),
    queryFn: () => getProductionOrder(id as number),
    enabled: id !== null && id > 0,
  });
}

/** The items the order is still short of; it never blocks a stage, so it only informs. */
export function useProductionShortage(id: number | null, enabled = true) {
  return useQuery({
    queryKey: productionOrderQueryKeys.shortage(id ?? 0),
    queryFn: () => getProductionShortage(id as number),
    enabled: enabled && id !== null && id > 0,
  });
}

/**
 * The newest production order of a sales order that has not been cancelled.
 *
 * The API lists every production order of the order, cancelled ones included, newest first;
 * a cancelled one leaves the order free for a new production order, so it is skipped here.
 */
export function useLiveProductionOrderOf(
  orderId: number | null,
  enabled: boolean,
) {
  const query = useProductionOrderList(
    { orderId: orderId ?? undefined },
    enabled && orderId !== null,
  );
  const live = query.data?.data.find((row) => row.status !== "cancelled");
  return { live, isLoading: query.isLoading };
}

export function useTechnicianOptions(enabled: boolean) {
  return useQuery({
    queryKey: productionOrderQueryKeys.technicians,
    queryFn: getTechnicianOptions,
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useOpenOrders(enabled: boolean) {
  return useQuery({
    queryKey: productionOrderQueryKeys.openOrders,
    queryFn: () => getOpenOrders(),
    enabled,
  });
}

export function useCreateProductionOrder() {
  const t = useTranslations(TOAST);
  const feedback = useOrderFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (orderId: number) => createProductionOrder(orderId),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: store,
  });
}

export function useUpdateProductionUnit(id: number) {
  const feedback = useOrderFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (input: UnitUpdateInput & { unitId: number }) => {
      const { unitId, ...changes } = input;
      return updateProductionUnit(id, unitId, changes);
    },
    ...feedback,
    onSuccess: store,
  });
}

export function useReleaseProductionOrder(id: number) {
  const t = useTranslations(TOAST);
  const feedback = useOrderFeedback();
  const store = useStoreDetail(true);
  return useMutationFeedback({
    mutationFn: () => releaseProductionOrder(id),
    successMessage: t("releaseSuccess"),
    ...feedback,
    // The dialog lists the unfinished cabinets itself.
    isInlineFormError: (error) => unitCodesFromReleaseError(error).length > 0,
    onSuccess: store,
  });
}

export function useCancelProductionOrder(id: number) {
  const t = useTranslations(TOAST);
  const feedback = useOrderFeedback();
  const store = useStoreDetail(true);
  return useMutationFeedback({
    mutationFn: (reason: string) => cancelProductionOrder(id, reason),
    successMessage: t("cancelSuccess"),
    ...feedback,
    onSuccess: store,
  });
}
