"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { downloadBlob } from "@/kernel/core/lib/download-blob";

import {
  quotationQueryKeys,
  type QuotationAction,
  type QuotationExportFormat,
} from "@plugins/sales/quotation/constants";
import { useQuotationToast } from "@plugins/sales/quotation/hooks/api/useQuotation";
import {
  addQuotationFeedback,
  fetchQuotationExport,
  getQuotationFeedback,
  runQuotationAction,
} from "@plugins/sales/quotation/services/quotation.service";
import { resolveQuotationToastKey } from "@plugins/sales/quotation/utils/map-quotation-api-errors";
import { requestQueryKeys } from "@plugins/sales/request/constants";

import type {
  CreateQuotationFeedbackDto,
  QuotationDetail,
} from "@plugins/sales/quotation/types";

/** Toast key of each action's success sentence. */
const SUCCESS_KEYS: Record<QuotationAction, string> = {
  submit: "submitSuccess",
  approve: "approveSuccess",
  reject: "rejectSuccess",
  confirm: "confirmSuccess",
  cancel: "cancelSuccess",
  revise: "reviseSuccess",
  "refresh-estimate": "refreshSuccess",
};

/**
 * One decision of the quotation workflow (submit, approve, reject, confirm, cancel, revise, or
 * a refresh from the latest estimate). The server answers with the whole quotation, which
 * replaces the cached one at once; the request moves with approval and cancellation, so its
 * own pages are refreshed too. `reason` is the variable of a reject or a cancel.
 */
export function useQuotationAction(id: number, action: QuotationAction) {
  const { t, feedback } = useQuotationToast();
  const qc = useQueryClient();
  return useMutationFeedback({
    // A fixed discount can exceed the rebuilt subtotal: say to lower it first, not that the
    // save failed.
    resolveErrorMessage: (error: unknown) =>
      action === "refresh-estimate" &&
      resolveQuotationToastKey(error) === "discountTooLarge"
        ? t("refreshDiscountTooLarge")
        : feedback.resolveErrorMessage(error),
    mutationFn: (reason?: string) => runQuotationAction(id, action, reason),
    successMessage: t(SUCCESS_KEYS[action]),
    errorMessage: feedback.errorMessage,
    onSuccess: (detail: QuotationDetail) => {
      qc.setQueryData(quotationQueryKeys.detail(id), detail);
      qc.invalidateQueries({ queryKey: quotationQueryKeys.all });
      qc.invalidateQueries({ queryKey: requestQueryKeys.all });
    },
  });
}

export function useQuotationFeedbackLog(id: number, enabled = true) {
  return useQuery({
    queryKey: quotationQueryKeys.feedback(id),
    queryFn: () => getQuotationFeedback(id),
    enabled: enabled && id > 0,
    staleTime: 0,
  });
}

export function useAddQuotationFeedback(id: number) {
  const { t, feedback } = useQuotationToast();
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: (data: CreateQuotationFeedbackDto) =>
      addQuotationFeedback(id, data),
    successMessage: t("feedbackSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationQueryKeys.feedback(id) });
    },
  });
}

/** Downloads the customer-facing file; the name is the quotation code made file-safe. */
export function useDownloadQuotation(id: number, code: string) {
  const { feedback } = useQuotationToast();
  return useMutationFeedback({
    mutationFn: async (format: QuotationExportFormat) => {
      const blob = await fetchQuotationExport(id, format);
      downloadBlob(blob, `${code.replace(/[^A-Za-z0-9-]+/g, "-")}.${format}`);
    },
    ...feedback,
  });
}
