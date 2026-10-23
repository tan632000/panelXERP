"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import type {
  BulkDeleteId,
  BulkDeleteResult,
} from "@/kernel/core/types/bulk-delete";

/** What a list page supplies when it wires its own bulk delete. */
export interface BulkDeleteHookOptions<TId extends BulkDeleteId = number> {
  /** Unticks the rows that were deleted, leaving a refused row selected. */
  onDeleted?: (ids: TId[]) => void;
}

export interface BulkDeleteMutationOptions<
  TId extends BulkDeleteId = number,
> extends BulkDeleteHookOptions<TId> {
  mutationFn: (ids: TId[]) => Promise<BulkDeleteResult<TId>>;
  /** Toast namespace of the plugin, for `systemError` and `forbidden`. */
  toastNamespace: string;
  /** Query key to invalidate; the list reloads whatever the batch changed. */
  invalidateQueryKey: readonly unknown[];
  /** Feature-specific success text for specs with exact bulk wording. Defaults to common. */
  formatSuccess?: (count: number) => string;
  /**
   * Localized text for a refusal of the whole batch (an all-or-nothing delete naming the rows
   * that blocked it). Without it such a refusal reads as the plugin's generic system error.
   */
  resolveMutationError?: (error: unknown) => string | undefined;
}

/**
 * Runs one bulk delete and reports how much of it landed.
 *
 * The request succeeds even when it deleted nothing, because a row a guard refuses is an
 * outcome rather than an error. What was deleted is reported here as a toast, since it needs
 * no reading; why the rest was kept is explained row by row by `BulkDeleteAction`'s report,
 * which the caller receives through `mutate`'s `onSettled`. The two never overlap: the toast
 * counts what went, the report says what stayed.
 */
export function useBulkDeleteMutation<TId extends BulkDeleteId = number>({
  mutationFn,
  toastNamespace,
  invalidateQueryKey,
  onDeleted,
  formatSuccess,
  resolveMutationError,
}: BulkDeleteMutationOptions<TId>) {
  const t = useTranslations("common.bulkDelete");
  const qc = useQueryClient();
  const { showSuccess } = useNotification();
  const feedback = useToastMutationFeedback(toastNamespace, {
    resolveMutationError,
  });

  return useMutationFeedback({
    mutationFn,
    ...feedback,
    onSuccess: (result) => {
      // The batch may have left the list stale either way: a refused row can be one another
      // session already deleted.
      qc.invalidateQueries({ queryKey: invalidateQueryKey });
      onDeleted?.(result.deleted);

      if (result.deleted.length > 0) {
        showSuccess(
          formatSuccess
            ? formatSuccess(result.deleted.length)
            : t("success", { count: result.deleted.length }),
        );
      }
    },
  });
}
