"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { RevisionStatus } from "@plugins/sales/estimate/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const BADGE_TONE: Record<RevisionStatus, string> = {
  draft: "draft",
  submitted: "completed",
  superseded: "closed",
};

export function EstimateStatusBadge({
  status,
  size,
}: {
  status: RevisionStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("estimate.statuses");
  return (
    <StatusBadge status={BADGE_TONE[status]} label={t(status)} size={size} />
  );
}
