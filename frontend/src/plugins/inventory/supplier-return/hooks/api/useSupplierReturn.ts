"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { purchaseOrderQueryKeys } from "@plugins/inventory/purchase-order/constants";
import { supplierReturnQueryKeys } from "@plugins/inventory/supplier-return/constants";
import {
  createSupplierReturn,
  getSupplierReturns,
} from "@plugins/inventory/supplier-return/services/supplier-return.service";

import type { SupplierReturnInput } from "@plugins/inventory/supplier-return/types";

const TOAST = "supplierReturn.toast";

/** The returns of one purchase order, newest first. */
export function useSupplierReturns(purchaseOrderId: number, enabled = true) {
  const params = { purchaseOrderId, limit: 50 };
  return useQuery({
    queryKey: supplierReturnQueryKeys.list(params),
    queryFn: () => getSupplierReturns(params),
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

/** A refusal the form could not foresee (more than received or on hand meanwhile) is a 409. */
export function useCreateSupplierReturn() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("conflict") : undefined,
  });
  return useMutationFeedback({
    mutationFn: (input: SupplierReturnInput) => createSupplierReturn(input),
    successMessage: t("createSuccess"),
    ...feedback,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: supplierReturnQueryKeys.all });
      qc.invalidateQueries({ queryKey: purchaseOrderQueryKeys.all });
    },
  });
}
