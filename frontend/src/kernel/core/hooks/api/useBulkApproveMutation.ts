"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import type {
  BulkApproveId,
  BulkApproveResult,
} from "@/kernel/core/types/bulk-approve";

/** What a list page supplies when it wires its own bulk approval. */
export interface BulkApproveHookOptions<TId extends BulkApproveId = number> {
  /** Unticks the rows that were approved, leaving a refused row selected. */
  onApproved?: (ids: TId[]) => void;
  /** Reports what an approved row still needs, e.g. boxes held for a return scan. */
  onWarnings?: (
    warnings: NonNullable<BulkApproveResult<TId>["warnings"]>,
  ) => void;
}

export interface BulkApproveMutationOptions<
  TId extends BulkApproveId = number,
> extends BulkApproveHookOptions<TId> {
  mutationFn: (ids: TId[]) => Promise<BulkApproveResult<TId>>;
  /** Toast namespace of the plugin, for `systemError` and `forbidden`. */
  toastNamespace: string;
  /** Query keys to invalidate; the list (and anything an approval writes back) reloads. */
  invalidateQueryKey: readonly unknown[] | ReadonlyArray<readonly unknown[]>;
}

function isKeyList(
  key: readonly unknown[] | ReadonlyArray<readonly unknown[]>,
): key is ReadonlyArray<readonly unknown[]> {
  return key.length > 0 && key.every(Array.isArray);
}

/**
 * Runs one bulk approval and reports how much of it landed: what was approved as a toast,
 * why the rest was kept through `BulkApproveAction`'s report, the same split as bulk delete.
 */
export function useBulkApproveMutation<TId extends BulkApproveId = number>({
  mutationFn,
  toastNamespace,
  invalidateQueryKey,
  onApproved,
  onWarnings,
}: BulkApproveMutationOptions<TId>) {
  const t = useTranslations("common.bulkApprove");
  const qc = useQueryClient();
  const { showSuccess } = useNotification();
  const feedback = useToastMutationFeedback(toastNamespace);

  return useMutationFeedback({
    mutationFn,
    ...feedback,
    onSuccess: (result) => {
      onApproved?.(result.approved);

      if (result.approved.length > 0) {
        showSuccess(t("success", { count: result.approved.length }));
      }
      if (result.warnings?.length) onWarnings?.(result.warnings);
    },
    // A batch that fails part-way has already committed the rows before the fault, so the
    // list reloads either way.
    onSettled: () => {
      const keys = isKeyList(invalidateQueryKey)
        ? invalidateQueryKey
        : [invalidateQueryKey];
      for (const queryKey of keys) qc.invalidateQueries({ queryKey });
    },
  });
}
