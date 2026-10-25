"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { QuotationVersionStatus } from "@plugins/sales/quotation/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const BADGE_TONE: Record<QuotationVersionStatus, string> = {
  draft: "draft",
  pending_approval: "pending",
  approved: "approved",
  rejected: "lost",
  customer_confirmed: "completed",
  cancelled: "cancelled",
  closed: "closed",
};

export function QuotationStatusBadge({
  status,
  size,
}: {
  status: QuotationVersionStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("quotation.statuses");
  return (
    <StatusBadge status={BADGE_TONE[status]} label={t(status)} size={size} />
  );
}
