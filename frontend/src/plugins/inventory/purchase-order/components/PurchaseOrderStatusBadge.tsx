"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { PurchaseOrderStatus } from "@plugins/inventory/purchase-order/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const BADGE_TONE: Record<PurchaseOrderStatus, string> = {
  draft: "draft",
  pending_approval: "pending",
  approved: "approved",
  partially_received: "processing",
  received: "received",
  closed: "closed",
  cancelled: "cancelled",
};

export function PurchaseOrderStatusBadge({
  status,
}: {
  status: PurchaseOrderStatus;
}) {
  const t = useTranslations("purchaseOrder.statuses");
  return <StatusBadge status={BADGE_TONE[status]} label={t(status)} />;
}
