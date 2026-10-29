"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { materialQueryKeys } from "@plugins/inventory/material/constants";
import { purchaseOrderQueryKeys } from "@plugins/inventory/purchase-order/constants";
import { purchaseRequestQueryKeys } from "@plugins/inventory/purchase-request/constants";
import {
  cancelPurchaseRequest,
  createPurchaseRequest,
  getPurchaseRequests,
  getSuppliers,
  orderRequestLines,
  requestFromOrder,
} from "@plugins/inventory/purchase-request/services/purchase-request.service";

import type { PurchaseRequestInput } from "@plugins/inventory/purchase-request/types";

const TOAST = "purchaseRequest.toast";

/** A refusal the screen could not foresee (already requested or ordered meanwhile) is a 409. */
function useRequestFeedback() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("conflict") : undefined,
  });
  return {
    ...feedback,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: purchaseRequestQueryKeys.all });
      qc.invalidateQueries({ queryKey: purchaseOrderQueryKeys.all });
      qc.invalidateQueries({ queryKey: materialQueryKeys.all });
    },
  };
}

export function usePurchaseRequestList(params: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: purchaseRequestQueryKeys.list(params),
    queryFn: () => getPurchaseRequests(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: purchaseRequestQueryKeys.suppliers,
    queryFn: getSuppliers,
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useCreatePurchaseRequest() {
  const t = useTranslations(TOAST);
  return useMutationFeedback({
    mutationFn: (input: PurchaseRequestInput) => createPurchaseRequest(input),
    successMessage: t("createSuccess"),
    ...useRequestFeedback(),
  });
}

export function useRequestFromOrder() {
  const t = useTranslations(TOAST);
  return useMutationFeedback({
    mutationFn: (orderId: number) => requestFromOrder(orderId),
    successMessage: t("createSuccess"),
    ...useRequestFeedback(),
  });
}

export function useCancelPurchaseRequest() {
  const t = useTranslations(TOAST);
  return useMutationFeedback({
    mutationFn: (input: { id: number; reason: string }) =>
      cancelPurchaseRequest(input.id, input.reason),
    successMessage: t("cancelSuccess"),
    ...useRequestFeedback(),
  });
}

export function useOrderRequestLines() {
  const t = useTranslations(TOAST);
  return useMutationFeedback({
    mutationFn: orderRequestLines,
    successMessage: t("orderSuccess"),
    ...useRequestFeedback(),
  });
}
