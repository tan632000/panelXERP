"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { Icon } from "@/kernel/core/components/ui/Icon";

/**
 * Deactivates the accounts ticked in the list: the button of the table's selection bar and
 * the confirmation it opens.
 *
 * Deactivation is what this screen has in place of a delete — the accounts keep every record
 * they created — so it is confirmed the same way a bulk delete is, and never runs on the
 * click alone.
 */
export function BulkDeactivateAction({
  count,
  pending = false,
  onConfirm,
}: {
  count: number;
  pending?: boolean;
  onConfirm: (close: () => void) => void;
}) {
  const t = useTranslations("system.users");
  const tCommon = useTranslations("common");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-danger-text/30 bg-surface-primary px-2.5 py-1.5 text-xs font-semibold text-danger-text hover:bg-danger-bg"
      >
        <Icon name="ban" size={14} />
        {t("bulkDeactivate", { count })}
      </button>

      <ConfirmDialog
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        onConfirm={() => onConfirm(() => setIsOpen(false))}
        title={t("confirmBulkDeactivateTitle", { count })}
        description={t("confirmBulkDeactivateDescription")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("deactivate")}
        pending={pending}
      />
    </>
  );
}
