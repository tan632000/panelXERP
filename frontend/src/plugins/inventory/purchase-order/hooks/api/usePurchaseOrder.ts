"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { purchaseOrderQueryKeys } from "@plugins/inventory/purchase-order/constants";
import {
  createPurchaseOrder,
  getPurchaseOrder,
  getPurchaseOrders,
  runPurchaseOrderAction,
  updatePurchaseOrder,
} from "@plugins/inventory/purchase-order/services/purchase-order.service";

import type { PurchaseOrderAction } from "@plugins/inventory/purchase-order/constants";
import type {
  PurchaseOrderDetail,
  PurchaseOrderInput,
  PurchaseOrderListParams,
} from "@plugins/inventory/purchase-order/types";

const TOAST = "purchaseOrder.toast";

/**
 * A refused transition (the order moved on, goods received, an item or supplier gone) is a
 * 409; the separation-of-duties refusal is a 403 and keeps the generic permission text.
 */
function useOrderFeedback() {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("conflict");
      if (status === 404) return t("notFound");
      return undefined;
    },
  });
}

export function usePurchaseOrderList(params: PurchaseOrderListParams = {}) {
  return useQuery({
    queryKey: purchaseOrderQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getPurchaseOrders(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function usePurchaseOrder(id: number | null) {
  return useQuery({
    queryKey: purchaseOrderQueryKeys.detail(id ?? 0),
    queryFn: () => getPurchaseOrder(id as number),
    enabled: id !== null && id > 0,
  });
}

function useStoreDetail() {
  const qc = useQueryClient();
  return (detail: PurchaseOrderDetail) => {
    qc.setQueryData(purchaseOrderQueryKeys.detail(detail.id), detail);
    qc.invalidateQueries({ queryKey: purchaseOrderQueryKeys.all });
  };
}

export function useCreatePurchaseOrder() {
  const t = useTranslations(TOAST);
  const feedback = useOrderFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (input: PurchaseOrderInput) => createPurchaseOrder(input),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: store,
  });
}

export function useUpdatePurchaseOrder(id: number) {
  const t = useTranslations(TOAST);
  const feedback = useOrderFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (input: Partial<PurchaseOrderInput>) =>
      updatePurchaseOrder(id, input),
    successMessage: t("updateSuccess"),
    ...feedback,
    onSuccess: store,
  });
}

export function usePurchaseOrderAction(
  id: number,
  action: PurchaseOrderAction,
) {
  const t = useTranslations(TOAST);
  const feedback = useOrderFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (reason?: string) => runPurchaseOrderAction(id, action, reason),
    successMessage: t(`${action}Success`),
    ...feedback,
    onSuccess: store,
  });
}
