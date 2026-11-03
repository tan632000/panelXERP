"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { ProductionOrderStatus } from "@plugins/production/production-order/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const BADGE_TONE: Record<ProductionOrderStatus, string> = {
  draft: "draft",
  released: "inProgress",
  completed: "completed",
  cancelled: "cancelled",
};

export function ProductionOrderStatusBadge({
  status,
  size,
}: {
  status: ProductionOrderStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("production.statuses");
  return (
    <StatusBadge status={BADGE_TONE[status]} label={t(status)} size={size} />
  );
}
