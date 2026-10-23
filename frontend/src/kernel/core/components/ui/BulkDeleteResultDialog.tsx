"use client";

import { useTranslations } from "next-intl";
import React, { useEffect } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";

import type {
  BulkDeleteFailure,
  BulkDeleteId,
} from "@/kernel/core/types/bulk-delete";

/** How many refused rows are named before the rest are counted. */
const MAX_LISTED_FAILURES = 8;

export interface BulkDeleteResultDialogProps<
  TId extends BulkDeleteId = number,
> {
  open: boolean;
  failures: Array<BulkDeleteFailure<TId>>;
  /** Names a refused row the way the list does, e.g. by its code. */
  labelOf?: (id: TId) => string | undefined;
  /** The plugin's reason for one backend wording; the whole failure is passed for its status. */
  resolveReason: (message: string, failure: BulkDeleteFailure<TId>) => string;
  onClose: () => void;
  /**
   * Message namespace holding `failedTitle`, `failedDescription`, `failedHint` and
   * `moreFailures`. Another bulk action (approve) reports its refused rows the same way.
   */
  messagesNamespace?: "common.bulkDelete" | "common.bulkApprove";
}

/**
 * Why a bulk delete kept the rows it kept.
 *
 * A count alone leaves the user without the one thing they need — a row is refused because
 * something still points at it, and only the reason says what to clear first. Each refused
 * row is therefore named with its own reason; the rows also stay ticked in the table behind
 * this dialog, so the selection still marks them once it is dismissed.
 *
 * It reports only the rows that stayed. What the same batch did delete is a toast, because a
 * count needs no reading and repeating it here would make the dialog argue with itself.
 */
export function BulkDeleteResultDialog<TId extends BulkDeleteId = number>({
  open,
  failures,
  labelOf,
  resolveReason,
  onClose,
  messagesNamespace = "common.bulkDelete",
}: Readonly<BulkDeleteResultDialogProps<TId>>) {
  const t = useTranslations(messagesNamespace);
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || failures.length === 0) return null;

  const listed = failures.slice(0, MAX_LISTED_FAILURES);
  const hiddenCount = failures.length - listed.length;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-result-title"
        className="flex max-h-[80vh] w-[460px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border-secondary bg-surface-primary shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
      >
        <div className="flex flex-col items-center px-6 pb-2 pt-7 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger-text ring-8 ring-danger-bg/40">
            <Icon name="alert" size={22} />
          </div>

          <h2
            id="bulk-delete-result-title"
            className="mb-2 text-base font-semibold tracking-tight text-text-primary"
          >
            {t("failedTitle", { count: failures.length })}
          </h2>
          <p className="max-w-[340px] text-[13px] leading-relaxed text-text-secondary">
            {t("failedDescription")}
          </p>
        </div>

        <ul className="scrollbar-thin mx-6 mb-2 mt-4 flex-1 divide-y divide-border-tertiary overflow-y-auto rounded-lg border border-border-secondary">
          {listed.map((failure) => (
            <li key={failure.id} className="px-3 py-2 text-[13px]">
              <span className="font-semibold text-text-primary">
                {labelOf?.(failure.id) ?? `#${failure.id}`}
              </span>
              <span className="mt-0.5 block text-text-secondary">
                {resolveReason(failure.message, failure)}
              </span>
            </li>
          ))}
        </ul>

        {hiddenCount > 0 && (
          <p className="px-6 text-xs text-text-tertiary">
            {t("moreFailures", { count: hiddenCount })}
          </p>
        )}

        <p className="px-6 pb-1 pt-2 text-xs text-text-tertiary">
          {t("failedHint")}
        </p>

        <div className="mt-3 border-t border-border-tertiary bg-surface-secondary/60 px-6 py-4">
          <button
            type="button"
            className="ml-auto flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-secondary bg-surface-primary px-4 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-secondary [font-family:inherit]"
            onClick={onClose}
          >
            {tCommon("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
