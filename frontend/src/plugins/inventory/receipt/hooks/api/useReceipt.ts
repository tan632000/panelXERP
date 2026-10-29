"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { purchaseOrderQueryKeys } from "@plugins/inventory/purchase-order/constants";
import { receiptQueryKeys } from "@plugins/inventory/receipt/constants";
import {
  createReceipt,
  getReceipts,
} from "@plugins/inventory/receipt/services/receipt.service";

import type {
  ReceiptInput,
  ReceiptListParams,
} from "@plugins/inventory/receipt/types";

const TOAST = "receipt.toast";

export function useReceiptList(params: ReceiptListParams = {}) {
  return useQuery({
    queryKey: receiptQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getReceipts(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/**
 * A refusal the screen could not foresee (more than remains after another receipt, the order
 * closed meanwhile) is a 409; the order and stock views are refreshed either way.
 */
export function useCreateReceipt() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("conflict") : undefined,
  });
  return useMutationFeedback({
    mutationFn: (input: ReceiptInput) => createReceipt(input),
    successMessage: t("createSuccess"),
    ...feedback,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: receiptQueryKeys.all });
      qc.invalidateQueries({ queryKey: purchaseOrderQueryKeys.all });
    },
  });
}
