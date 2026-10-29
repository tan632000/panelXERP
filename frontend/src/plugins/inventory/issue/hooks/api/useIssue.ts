"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { issueQueryKeys } from "@plugins/inventory/issue/constants";
import {
  createIssue,
  createWorkshopReturn,
  getIssues,
} from "@plugins/inventory/issue/services/issue.service";
import { materialQueryKeys } from "@plugins/inventory/material/constants";

import type {
  IssueInput,
  OrderStockDocumentListParams,
  WorkshopReturnInput,
} from "@plugins/inventory/issue/types";

const TOAST = "issue.toast";

export function useIssueList(params: OrderStockDocumentListParams = {}) {
  return useQuery({
    queryKey: issueQueryKeys.issues(params as Record<string, unknown>),
    queryFn: () => getIssues(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/**
 * A refusal the screen could not foresee (another order's reservation, the order cancelled
 * meanwhile, more than is out) is a 409; a missing over-BOM reason is a 400.
 */
function usePostFeedback() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("conflict");
      if (status === 400) return t("reasonRequired");
      return undefined;
    },
  });
  return {
    ...feedback,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueQueryKeys.all });
      qc.invalidateQueries({ queryKey: materialQueryKeys.all });
    },
  };
}

export function useCreateIssue() {
  const t = useTranslations(TOAST);
  const feedback = usePostFeedback();
  return useMutationFeedback({
    mutationFn: (input: IssueInput) => createIssue(input),
    successMessage: t("issueSuccess"),
    ...feedback,
  });
}

export function useCreateWorkshopReturn() {
  const t = useTranslations(TOAST);
  const feedback = usePostFeedback();
  return useMutationFeedback({
    mutationFn: (input: WorkshopReturnInput) => createWorkshopReturn(input),
    successMessage: t("returnSuccess"),
    ...feedback,
  });
}
