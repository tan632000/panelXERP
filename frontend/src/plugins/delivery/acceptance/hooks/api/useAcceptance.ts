"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { acceptanceQueryKeys } from "@plugins/delivery/acceptance/constants";
import {
  createAcceptance,
  getAcceptance,
} from "@plugins/delivery/acceptance/services/acceptance.service";
import { deliveryNoteQueryKeys } from "@plugins/delivery/delivery-note/constants";
import { orderQueryKeys } from "@plugins/sales/order/constants";

import type { AcceptanceInput } from "@plugins/delivery/acceptance/types";

const TOAST = "delivery.toast";

export function useAcceptance(orderId: number | null) {
  return useQuery({
    queryKey: acceptanceQueryKeys.order(orderId ?? 0),
    queryFn: () => getAcceptance(orderId as number),
    enabled: orderId !== null && orderId > 0,
  });
}

/** The minutes move the order to completed, so the delivery page's order and the sales orders reload. */
export function useCreateAcceptance(orderId: number) {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("acceptanceConflict");
      if (status === 413) return t("fileTooLarge");
      if (status === 400) return t("acceptanceRejected");
      return undefined;
    },
  });
  return useMutationFeedback({
    mutationFn: (input: AcceptanceInput) => createAcceptance(orderId, input),
    successMessage: t("acceptanceCreated"),
    ...feedback,
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: acceptanceQueryKeys.all }),
        qc.invalidateQueries({ queryKey: deliveryNoteQueryKeys.all }),
        qc.invalidateQueries({ queryKey: orderQueryKeys.all }),
      ]),
  });
}
