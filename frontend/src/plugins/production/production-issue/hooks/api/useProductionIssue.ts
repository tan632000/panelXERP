"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { issueQueryKeys } from "@plugins/production/production-issue/constants";
import {
  getIssues,
  openIssue,
  resolveIssue,
} from "@plugins/production/production-issue/services/production-issue.service";

import type {
  IssueListParams,
  OpenIssueInput,
} from "@plugins/production/production-issue/types";

const TOAST = "production.toast";

/** A refused change (order no longer released, issue already resolved) is a 409. */
function useIssueFeedback() {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("issueConflict") : undefined,
  });
}

export function useIssueList(params: IssueListParams, enabled = true) {
  return useQuery({
    queryKey: issueQueryKeys.list({ ...params }),
    queryFn: () => getIssues(params),
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useOpenIssue(unitId: number) {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useIssueFeedback();
  return useMutationFeedback({
    mutationFn: (input: OpenIssueInput) => openIssue(unitId, input),
    successMessage: t("issueOpened"),
    ...feedback,
    onSuccess: () => qc.invalidateQueries({ queryKey: issueQueryKeys.all }),
  });
}

export function useResolveIssue() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useIssueFeedback();
  return useMutationFeedback({
    mutationFn: (input: { id: number; resolution: string }) =>
      resolveIssue(input.id, input.resolution),
    successMessage: t("issueResolved"),
    ...feedback,
    onSuccess: () => qc.invalidateQueries({ queryKey: issueQueryKeys.all }),
  });
}
