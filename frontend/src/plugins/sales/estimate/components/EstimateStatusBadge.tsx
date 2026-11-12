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

/**
 * One badge for where an estimate stands. A submitted revision reads its pricing step instead
 * of "submitted": `pricedAt` null means it awaits sales, a date means it is priced. Leave
 * `pricedAt` out where pricing does not apply (an older revision), and the plain status shows.
 */
export function EstimateStatusBadge({
  status,
  pricedAt,
  size,
}: {
  status: RevisionStatus;
  pricedAt?: string | null;
  size?: "sm" | "md";
}) {
  const t = useTranslations("estimate");
  if (status === "submitted" && pricedAt !== undefined) {
    return (
      <StatusBadge
        status={pricedAt ? "completed" : "pending"}
        label={t(pricedAt ? "pricing.priced" : "pricing.awaiting")}
        size={size}
      />
    );
  }
  return (
    <StatusBadge
      status={BADGE_TONE[status]}
      label={t(`statuses.${status}`)}
      size={size}
    />
  );
}
