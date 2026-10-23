"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import {
  documentValidity,
  type DocumentValidityState,
} from "@/kernel/core/lib/document-validity";

const BADGE_CLASS: Record<DocumentValidityState, string> = {
  locked: "bg-surface-tertiary text-text-primary",
  unlimited: "bg-surface-secondary text-text-secondary",
  expired: "bg-danger-bg text-danger-text",
  expiringSoon: "bg-warning-bg text-warning-text",
  valid: "bg-success-bg text-success-text",
};

export interface DocumentValidityBadgeProps {
  expiryDate: string;
  locked?: boolean;
}

/**
 * How long a signed document stays in force. Both the sales and procurement document lists
 * show it, so the wording lives in `common.documentValidity` rather than either namespace.
 */
export function DocumentValidityBadge({
  expiryDate,
  locked,
}: DocumentValidityBadgeProps) {
  const t = useTranslations("common.documentValidity");
  const { state, days } = documentValidity({ expiryDate, locked });

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[13px] font-bold",
        BADGE_CLASS[state],
      )}
    >
      {state === "locked" ? (
        <Icon name="lock" size={13} className="mr-1" />
      ) : null}
      {t(state, { days: Math.abs(days) })}
    </span>
  );
}
