"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useState } from "react";

import { BulkDeleteResultDialog } from "@/kernel/core/components/ui/BulkDeleteResultDialog";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { MAX_BULK_DELETE_IDS } from "@/kernel/core/constants/list-ui";
import { toast } from "@/kernel/core/lib/toast";

import type {
  BulkApproveFailure,
  BulkApproveId,
  BulkApproveResult,
} from "@/kernel/core/types/bulk-approve";

/** Explains a refused row by its HTTP status when the plugin does not map its wording. */
function reasonKeyOf(status: number | undefined) {
  switch (status) {
    case 403:
      return "reasonForbidden";
    case 404:
      return "reasonNotFound";
    case 400:
    case 409:
    case 422:
      return "reasonNotPending";
    default:
      return "reasonUnknown";
  }
}

export interface BulkApproveActionProps<TId extends BulkApproveId = number> {
  /** How many rows are ticked. The action is absent at zero. */
  count: number;
  /**
   * Runs the approval for the ticked rows and hands back its outcome, or nothing when the
   * request itself failed. Pass a mutation's `onSettled`, which reports both.
   */
  onConfirm: (settle: (result?: BulkApproveResult<TId>) => void) => void;
  pending?: boolean;
  /** Names a refused row the way the list does, e.g. by its code. */
  labelOf?: (id: TId) => string | undefined;
  /**
   * The plugin's reason for one backend wording. Answering nothing falls back to the reason
   * the refusal's HTTP status implies.
   */
  resolveFailureReason?: (message: string) => string | undefined;
}

/**
 * Approves the rows ticked in a list: the button shown in the table's selection bar, the
 * confirmation it opens, and — when the batch could not approve everything — why.
 *
 * It mirrors `BulkDeleteAction`, so both read the same in the bar they share.
 */
export function BulkApproveAction<TId extends BulkApproveId = number>({
  count,
  onConfirm,
  pending = false,
  labelOf,
  resolveFailureReason,
}: Readonly<BulkApproveActionProps<TId>>) {
  const t = useTranslations("common.bulkApprove");
  const tCommon = useTranslations("common");
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<BulkApproveResult<TId> | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

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
      setResult(outcome && outcome.failed.length > 0 ? outcome : null);
    });
  }, [onConfirm]);

  const resolveReason = useCallback(
    (message: string, failure: BulkApproveFailure<TId>) =>
      resolveFailureReason?.(message) ?? t(reasonKeyOf(failure.status)),
    [resolveFailureReason, t],
  );

  if (count === 0 && isOpen) setIsOpen(false);

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-success-text/30 bg-success-bg px-2.5 py-1 text-xs font-medium text-success-text transition-colors hover:brightness-95 disabled:cursor-default disabled:opacity-50 [font-family:inherit]"
          onClick={requestConfirm}
          disabled={pending}
          title={t("buttonTitle")}
        >
          <Icon name="circle-check" size={13} /> {t("button", { count })}
        </button>
      )}

      <ConfirmDialog
        open={isOpen && count > 0}
        variant="default"
        icon="circle-check"
        title={t("title", { count })}
        description={t("description")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("confirm")}
        onCancel={close}
        onConfirm={handleConfirm}
        pending={pending}
      />

      <BulkDeleteResultDialog
        open={result !== null}
        failures={result?.failed ?? []}
        labelOf={labelOf}
        resolveReason={resolveReason}
        onClose={dismissResult}
        messagesNamespace="common.bulkApprove"
      />
    </>
  );
}
