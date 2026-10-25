"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { orderQueryKeys } from "@plugins/sales/order/constants";
import {
  cancelOrder,
  createOrder,
  getOrder,
  getOrders,
  updateOrder,
} from "@plugins/sales/order/services/order.service";
import { resolveOrderToastKey } from "@plugins/sales/order/utils/map-order-api-errors";
import { quotationQueryKeys } from "@plugins/sales/quotation/constants";
import { requestQueryKeys } from "@plugins/sales/request/constants";

import type {
  CreateOrderDto,
  OrderDetail,
  OrderHeaderDto,
  OrderListParams,
} from "@plugins/sales/order/types";

export function useOrderList(params: OrderListParams = {}) {
  return useQuery({
    queryKey: orderQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getOrders(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** The order of one quotation, or none; read by the quotation's own page. */
export function useOrderOfQuotation(quotationId: number, enabled = true) {
  return useQuery({
    queryKey: orderQueryKeys.ofQuotation(quotationId),
    queryFn: async () =>
      (await getOrders({ quotationId, limit: 1 })).data[0] ?? null,
    enabled: enabled && quotationId > 0,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useOrder(id?: number | null) {
  return useQuery({
    queryKey: orderQueryKeys.detail(id ?? 0),
    queryFn: () => getOrder(id as number),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** Feedback every order mutation shares: the toast namespace and the refusal wording table. */
function useOrderToast() {
  const t = useTranslations("order.toast");
  const feedback = useToastMutationFeedback("order.toast");
  return {
    t,
    feedback: {
      ...feedback,
      resolveErrorMessage: (error: unknown) => {
        const resolved = feedback.resolveErrorMessage?.(error);
        if (resolved) return resolved;
        const toastKey = resolveOrderToastKey(error);
        return toastKey ? t(toastKey) : undefined;
      },
    },
  };
}

/** Orders, their quotation and their request all move with a conversion or a cancellation. */
function useRefreshAfterOrderChange() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orderQueryKeys.all });
    qc.invalidateQueries({ queryKey: quotationQueryKeys.all });
    qc.invalidateQueries({ queryKey: requestQueryKeys.all });
  };
}

export function useCreateOrder() {
  const { t, feedback } = useOrderToast();
  const refresh = useRefreshAfterOrderChange();
  return useMutationFeedback({
    mutationFn: (data: CreateOrderDto) => createOrder(data),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: refresh,
  });
}

export function useUpdateOrder(id: number) {
  const { t, feedback } = useOrderToast();
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: (data: OrderHeaderDto) => updateOrder(id, data),
    successMessage: t("saveSuccess"),
    ...feedback,
    onSuccess: (detail: OrderDetail) => {
      qc.setQueryData(orderQueryKeys.detail(id), detail);
      qc.invalidateQueries({ queryKey: [...orderQueryKeys.all, "list"] });
    },
  });
}

export function useCancelOrder(id: number) {
  const { t, feedback } = useOrderToast();
  const qc = useQueryClient();
  const refresh = useRefreshAfterOrderChange();
  return useMutationFeedback({
    mutationFn: (reason: string) => cancelOrder(id, reason),
    successMessage: t("cancelSuccess"),
    ...feedback,
    onSuccess: (detail: OrderDetail) => {
      qc.setQueryData(orderQueryKeys.detail(id), detail);
      refresh();
    },
  });
}
