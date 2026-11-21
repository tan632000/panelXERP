"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type {
  QcDefectStatus,
  QcUnitStatus,
} from "@plugins/delivery/qc-inspection/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const UNIT_TONE: Record<QcUnitStatus, string> = {
  not_ready: "draft",
  waiting: "pending",
  failed: "expired",
  passed: "completed",
};

const DEFECT_TONE: Record<QcDefectStatus, string> = {
  open: "expired",
  fixed: "inProgress",
  verified: "completed",
};

export function QcUnitStatusBadge({ status }: Readonly<{ status: QcUnitStatus }>) {
  const t = useTranslations("delivery.qc.statuses");
  return <StatusBadge status={UNIT_TONE[status]} label={t(status)} />;
}

export function QcDefectStatusBadge({
  status,
}: Readonly<{ status: QcDefectStatus }>) {
  const t = useTranslations("delivery.qc.defectStatuses");
  return <StatusBadge status={DEFECT_TONE[status]} label={t(status)} />;
}

/** A round's own result: passed or failed. */
export function QcRoundResultBadge({
  result,
}: Readonly<{ result: "passed" | "failed" }>) {
  const t = useTranslations("delivery.qc.statuses");
  return (
    <StatusBadge
      status={result === "passed" ? "completed" : "expired"}
      label={t(result)}
    />
  );
}
