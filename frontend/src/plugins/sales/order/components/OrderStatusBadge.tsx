"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { OrderStatus } from "@plugins/sales/order/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const BADGE_TONE: Record<OrderStatus, string> = {
  open: "inProgress",
  in_production: "processing",
  delivered: "delivered",
  completed: "completed",
  cancelled: "cancelled",
};

export function OrderStatusBadge({
  status,
  size,
}: {
  status: OrderStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("order.statuses");
  return (
    <StatusBadge status={BADGE_TONE[status]} label={t(status)} size={size} />
  );
}
