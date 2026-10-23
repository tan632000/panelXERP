"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useState } from "react";

import { BulkDeleteResultDialog } from "@/kernel/core/components/ui/BulkDeleteResultDialog";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { MAX_BULK_DELETE_IDS } from "@/kernel/core/constants/list-ui";
import { toast } from "@/kernel/core/lib/toast";

import type {
  BulkDeleteId,
  BulkDeleteResult,
} from "@/kernel/core/types/bulk-delete";

export interface BulkDeleteActionProps<TId extends BulkDeleteId = number> {
  /** How many rows are ticked. The action is absent at zero. */
  count: number;
  /**
   * Runs the delete for the ticked rows and hands back its outcome, or nothing when the
   * request itself failed. Pass a mutation's `onSettled`, which reports both.
   */
  onConfirm: (settle: (result?: BulkDeleteResult<TId>) => void) => void;
  pending?: boolean;
  /** Names a refused row the way the list does, e.g. by its code. */
  labelOf?: (id: TId) => string | undefined;
  /** The plugin's reason for one backend wording, from `useDeleteFailureReason`. */
  resolveFailureReason?: (message: string) => string;
  /** Feature-specific overrides for specs with exact bulk wording. Defaults to common. */
  buttonLabel?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}

/**
 * Deletes the rows ticked in a list: the button shown in the table's selection bar, the
 * confirmation it opens, and — when the batch could not delete everything — why.
 *
 * The button is absent rather than disabled while nothing is ticked, because the bar holding
 * it only exists over a selection.
 */
export function BulkDeleteAction<TId extends BulkDeleteId = number>({
  count,
  onConfirm,
  pending = false,
  labelOf,
  resolveFailureReason,
  buttonLabel,
  dialogTitle,
  dialogDescription,
}: Readonly<BulkDeleteActionProps<TId>>) {
  const t = useTranslations("common.bulkDelete");
  const tCommon = useTranslations("common");
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult<TId> | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

  /**
   * A selection larger than one request may carry is refused before the confirmation, so the
   * user is told to unselect some rather than meeting a validation error after confirming.
   */
  const requestConfirm = useCallback(() => {
    if (count > MAX_BULK_DELETE_IDS) {
      toast.showWarning(t("tooMany", { max: MAX_BULK_DELETE_IDS }));
      return;
    }
    setIsOpen(true);
  }, [count, t]);
  const dismissResult = useCallback(() => setResult(null), []);

  const handleConfirm = useCallback(() => {
    onConfirm((outcome) => {
      setIsOpen(false);
      // A batch that deleted everything needs no report; its toast already said so.
      setResult(outcome && outcome.failed.length > 0 ? outcome : null);
    });
  }, [onConfirm]);

  const fallbackReason = useCallback(() => t("reasonUnknown"), [t]);

  /**
   * A batch that empties the selection also closes the confirmation, so it can never be left
   * open over rows that are gone — nor reopen by itself at the next tick. The report of a
   * batch that kept rows outlives the selection, because those rows are what it explains.
   */
  if (count === 0 && isOpen) setIsOpen(false);

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-danger-text/30 bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger-text transition-colors hover:brightness-95 disabled:cursor-default disabled:opacity-50 [font-family:inherit]"
          onClick={requestConfirm}
          disabled={pending}
          title={t("buttonTitle")}
        >
          <Icon name="trash" size={13} />{" "}
          {buttonLabel ?? t("button", { count })}
        </button>
      )}

      <ConfirmDialog
        open={isOpen && count > 0}
        title={dialogTitle ?? t("title", { count })}
        description={dialogDescription ?? t("description")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onCancel={close}
        onConfirm={handleConfirm}
        pending={pending}
      />

      <BulkDeleteResultDialog
        open={result !== null}
        failures={result?.failed ?? []}
        labelOf={labelOf}
        resolveReason={resolveFailureReason ?? fallbackReason}
        onClose={dismissResult}
      />
    </>
  );
}
