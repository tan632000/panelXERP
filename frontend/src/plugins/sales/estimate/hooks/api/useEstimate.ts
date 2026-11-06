"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { extractApiErrorMessage } from "@/kernel/core/lib/errors";

import { estimateQueryKeys } from "@plugins/sales/estimate/constants";
import {
  addBomLine,
  addCostLine,
  addPanel,
  createEstimate,
  deleteBomLine,
  deleteCostLine,
  deletePanel,
  getEstimate,
  getEstimates,
  completeEstimatePricing,
  reviseEstimate,
  setBomLineUnitCost,
  submitEstimate,
  updateBomLine,
  updateCostLine,
  updatePanel,
} from "@plugins/sales/estimate/services/estimate.service";
import { resolveEstimateToastKey } from "@plugins/sales/estimate/utils/map-estimate-api-errors";
import { requestQueryKeys } from "@plugins/sales/request/constants";

import type {
  CreateBomLineDto,
  CreateCostLineDto,
  CreatePanelDto,
  EstimateDetail,
  EstimateListParams,
  EstimateRevision,
  PriceBomLineDto,
  UpdateBomLineDto,
  UpdateCostLineDto,
  UpdatePanelDto,
} from "@plugins/sales/estimate/types";

export function useEstimateList(params: EstimateListParams = {}) {
  return useQuery({
    queryKey: estimateQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getEstimates(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** The estimate of one request, or none; read by the request's own page. */
export function useEstimateOfRequest(requestId: number, enabled = true) {
  return useQuery({
    queryKey: estimateQueryKeys.ofRequest(requestId),
    queryFn: async () =>
      (await getEstimates({ requestId, limit: 1 })).data[0] ?? null,
    enabled: enabled && requestId > 0,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** One estimate with the revision asked for (the latest when omitted). */
export function useEstimate(id?: number | null, revision?: number) {
  return useQuery({
    queryKey: estimateQueryKeys.detail(id ?? 0, revision),
    queryFn: () => getEstimate(id as number, revision),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** Feedback every estimate mutation shares: the toast namespace and the refusal wording table. */
function useEstimateFeedback() {
  const t = useTranslations("estimate.toast");
  const feedback = useToastMutationFeedback("estimate.toast");
  return {
    t,
    feedback: {
      ...feedback,
      resolveErrorMessage: (error: unknown) => {
        const resolved = feedback.resolveErrorMessage?.(error);
        if (resolved) return resolved;
        const toastKey = resolveEstimateToastKey(error);
        return toastKey ? t(toastKey) : undefined;
      },
    },
  };
}

/** What a document-level change touches: estimates, and the request whose status it moved. */
function useInvalidateAfterTransition() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: estimateQueryKeys.all });
    qc.invalidateQueries({ queryKey: requestQueryKeys.all });
  };
}

export function useCreateEstimate() {
  const { t, feedback } = useEstimateFeedback();
  const invalidate = useInvalidateAfterTransition();
  return useMutationFeedback({
    mutationFn: (requestId: number) => createEstimate(requestId),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: invalidate,
  });
}

export function useSubmitEstimate() {
  const { t, feedback } = useEstimateFeedback();
  const invalidate = useInvalidateAfterTransition();
  return useMutationFeedback({
    mutationFn: (id: number) => submitEstimate(id),
    successMessage: t("submitSuccess"),
    ...feedback,
    onSuccess: invalidate,
  });
}

export function useReviseEstimate() {
  const { t, feedback } = useEstimateFeedback();
  const invalidate = useInvalidateAfterTransition();
  return useMutationFeedback({
    mutationFn: (id: number) => reviseEstimate(id),
    successMessage: t("reviseSuccess"),
    ...feedback,
    onSuccess: invalidate,
  });
}

/** The item codes a refused completion names ("… no cost for: A, B."), or null for any other refusal. */
function zeroCostCodes(error: unknown): string | null {
  if (!isAxiosError(error) || error.response?.status !== 400) return null;
  const message = extractApiErrorMessage(error.response.data);
  return message?.match(/no cost for:\s*(.+?)\.?$/)?.[1] ?? null;
}

/** Marks the submitted revision priced; a refusal for zero-cost lines names their item codes. */
export function usePriceEstimate() {
  const { t, feedback } = useEstimateFeedback();
  const invalidate = useInvalidateAfterTransition();
  return useMutationFeedback({
    mutationFn: (id: number) => completeEstimatePricing(id),
    successMessage: t("priceSuccess"),
    ...feedback,
    resolveErrorMessage: (error: unknown) => {
      const codes = zeroCostCodes(error);
      return codes
        ? t("zeroCost", { codes })
        : feedback.resolveErrorMessage(error);
    },
    onSuccess: invalidate,
  });
}

/**
 * The edits of one revision, a draft or one awaiting pricing. Each answers with the revision as the server now computes
 * it, which replaces the cached one at once, so the totals on screen are the stored ones.
 */
export function useEstimateEdits(estimateId: number, revisionKey?: number) {
  const qc = useQueryClient();
  const { feedback } = useEstimateFeedback();

  const onSuccess = (revision: EstimateRevision) => {
    qc.setQueryData<EstimateDetail>(
      estimateQueryKeys.detail(estimateId, revisionKey),
      (previous) =>
        previous
          ? {
              ...previous,
              total: revision.total,
              current: revision,
              revisions: previous.revisions.map((entry) =>
                entry.revision === revision.revision
                  ? { ...entry, total: revision.total }
                  : entry,
              ),
            }
          : previous,
    );
    qc.invalidateQueries({ queryKey: [...estimateQueryKeys.all, "list"] });
  };
  const options = { ...feedback, onSuccess };

  return {
    addPanel: useMutationFeedback({
      mutationFn: (data: CreatePanelDto) => addPanel(estimateId, data),
      ...options,
    }),
    updatePanel: useMutationFeedback({
      mutationFn: (input: { panelId: number; data: UpdatePanelDto }) =>
        updatePanel(estimateId, input.panelId, input.data),
      ...options,
    }),
    deletePanel: useMutationFeedback({
      mutationFn: (panelId: number) => deletePanel(estimateId, panelId),
      ...options,
    }),
    addBomLine: useMutationFeedback({
      mutationFn: (input: { panelId: number; data: CreateBomLineDto }) =>
        addBomLine(estimateId, input.panelId, input.data),
      ...options,
    }),
    updateBomLine: useMutationFeedback({
      mutationFn: (input: { lineId: number; data: UpdateBomLineDto }) =>
        updateBomLine(estimateId, input.lineId, input.data),
      ...options,
    }),
    setUnitCost: useMutationFeedback({
      mutationFn: (input: { lineId: number; data: PriceBomLineDto }) =>
        setBomLineUnitCost(estimateId, input.lineId, input.data),
      ...options,
    }),
    deleteBomLine: useMutationFeedback({
      mutationFn: (lineId: number) => deleteBomLine(estimateId, lineId),
      ...options,
    }),
    addCostLine: useMutationFeedback({
      mutationFn: (input: { panelId: number; data: CreateCostLineDto }) =>
        addCostLine(estimateId, input.panelId, input.data),
      ...options,
    }),
    updateCostLine: useMutationFeedback({
      mutationFn: (input: { lineId: number; data: UpdateCostLineDto }) =>
        updateCostLine(estimateId, input.lineId, input.data),
      ...options,
    }),
    deleteCostLine: useMutationFeedback({
      mutationFn: (lineId: number) => deleteCostLine(estimateId, lineId),
      ...options,
    }),
  };
}
