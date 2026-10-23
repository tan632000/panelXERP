"use client";

import { Icon } from "@/kernel/core/components/ui/Icon";

interface SharedIdentityNoticeProps {
  /** Rendered only when the company serves both the customer and supplier catalogs. */
  visible: boolean;
  message: string;
}

/**
 * Warns that the company being edited is on file in both catalogs.
 *
 * Customers and suppliers are one row per legal entity, so the identity fields on this
 * form are the same ones the other catalog reads. Without this the editor has no way to
 * know a rename here also renames what the other department sees.
 */
export function SharedIdentityNotice({
  visible,
  message,
}: SharedIdentityNoticeProps) {
  if (!visible) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-warning-text/30 bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
      <Icon name="alert-triangle" size={16} className="mt-[1px] shrink-0" />
      <span>{message}</span>
    </div>
  );
}
