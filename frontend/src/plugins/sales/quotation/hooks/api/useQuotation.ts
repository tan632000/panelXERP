"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { quotationQueryKeys } from "@plugins/sales/quotation/constants";
import {
  createQuotation,
  getQuotation,
  getQuotations,
  updateQuotationPricing,
} from "@plugins/sales/quotation/services/quotation.service";
import { resolveQuotationToastKey } from "@plugins/sales/quotation/utils/map-quotation-api-errors";

import type {
  CreateQuotationDto,
  QuotationDetail,
  QuotationListParams,
  UpdateQuotationPricingDto,
} from "@plugins/sales/quotation/types";

export function useQuotationList(params: QuotationListParams = {}) {
  return useQuery({
    queryKey: quotationQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getQuotations(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** The quotation of one request, or none; read by the request's own page. */
export function useQuotationOfRequest(requestId: number, enabled = true) {
  return useQuery({
    queryKey: quotationQueryKeys.ofRequest(requestId),
    queryFn: async () =>
      (await getQuotations({ requestId, limit: 1 })).data[0] ?? null,
    enabled: enabled && requestId > 0,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** One quotation with the version asked for (the latest when omitted). */
export function useQuotation(id?: number | null, ver?: number) {
  return useQuery({
    queryKey: quotationQueryKeys.detail(id ?? 0, ver),
    queryFn: () => getQuotation(id as number, ver),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** Feedback every quotation mutation shares: the toast namespace and the refusal wording table. */
export function useQuotationToast() {
  const t = useTranslations("quotation.toast");
  const feedback = useToastMutationFeedback("quotation.toast");
  return {
    t,
    feedback: {
      ...feedback,
      resolveErrorMessage: (error: unknown) => {
        const resolved = feedback.resolveErrorMessage?.(error);
        if (resolved) return resolved;
        const toastKey = resolveQuotationToastKey(error);
        return toastKey ? t(toastKey) : undefined;
      },
    },
  };
}

export function useCreateQuotation() {
  const { t, feedback } = useQuotationToast();
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: (data: CreateQuotationDto) => createQuotation(data),
    successMessage: t("createSuccess"),
    ...feedback,
    // The request keeps its status; approval moves it on later.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationQueryKeys.all });
    },
  });
}

/**
 * Saves margins, discount and VAT of the draft version. The answer is the whole quotation as
 * the server now computes it; it replaces the cached one at once, so the totals on screen are
 * the stored ones.
 */
export function useUpdateQuotationPricing(id: number, ver?: number) {
  const { t, feedback } = useQuotationToast();
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: (data: UpdateQuotationPricingDto) =>
      updateQuotationPricing(id, data),
    successMessage: t("saveSuccess"),
    ...feedback,
    onSuccess: (detail: QuotationDetail) => {
      qc.setQueryData(quotationQueryKeys.detail(id, ver), detail);
      qc.invalidateQueries({ queryKey: [...quotationQueryKeys.all, "list"] });
    },
  });
}
