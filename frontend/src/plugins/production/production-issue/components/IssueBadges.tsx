"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type {
  IssueSeverity,
  IssueStatus,
} from "@plugins/production/production-issue/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const SEVERITY_TONE: Record<IssueSeverity, string> = {
  low: "draft",
  medium: "approaching",
  high: "expired",
};
const STATUS_TONE: Record<IssueStatus, string> = {
  open: "inProgress",
  resolved: "completed",
};

export function IssueSeverityBadge({ severity }: { severity: IssueSeverity }) {
  const t = useTranslations("production.issues.severities");
  return <StatusBadge status={SEVERITY_TONE[severity]} label={t(severity)} />;
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const t = useTranslations("production.issues.statuses");
  return <StatusBadge status={STATUS_TONE[status]} label={t(status)} />;
}
