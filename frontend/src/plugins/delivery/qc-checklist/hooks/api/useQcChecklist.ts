"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { qcChecklistQueryKeys } from "@plugins/delivery/qc-checklist/constants";
import {
  addChecklistItem,
  getChecklistItems,
  reorderChecklistItems,
  updateChecklistItem,
} from "@plugins/delivery/qc-checklist/services/qc-checklist.service";

import type { UpdateQcChecklistItemInput } from "@plugins/delivery/qc-checklist/types";

const TOAST = "delivery.toast";

/** A name already taken is a 409; a list that no longer matches the server's is a 400. */
function useChecklistFeedback() {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("checklistConflict");
      if (status === 400) return t("checklistStale");
      return undefined;
    },
  });
}

export function useChecklistItems(includeHidden: boolean) {
  return useQuery({
    queryKey: qcChecklistQueryKeys.list(includeHidden),
    queryFn: () => getChecklistItems(includeHidden),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useAddChecklistItem() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useChecklistFeedback();
  return useMutationFeedback({
    mutationFn: (name: string) => addChecklistItem(name),
    successMessage: t("checklistAdded"),
    ...feedback,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qcChecklistQueryKeys.all }),
  });
}

export function useUpdateChecklistItem() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useChecklistFeedback();
  return useMutationFeedback({
    mutationFn: (input: { id: number } & UpdateQcChecklistItemInput) => {
      const { id, ...change } = input;
      return updateChecklistItem(id, change);
    },
    successMessage: t("checklistUpdated"),
    ...feedback,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qcChecklistQueryKeys.all }),
  });
}

export function useReorderChecklistItems() {
  const qc = useQueryClient();
  const feedback = useChecklistFeedback();
  return useMutationFeedback({
    mutationFn: (ids: number[]) => reorderChecklistItems(ids),
    ...feedback,
    // Also after a refusal: a stale list is replaced by the server's.
    onSettled: () =>
      qc.invalidateQueries({ queryKey: qcChecklistQueryKeys.all }),
  });
}
