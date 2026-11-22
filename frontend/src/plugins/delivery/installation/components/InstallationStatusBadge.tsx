"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { InstallationStatus } from "@plugins/delivery/installation/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const TONE: Record<InstallationStatus, string> = {
  planned: "draft",
  in_progress: "inProgress",
  done: "completed",
};

export function InstallationStatusBadge({
  status,
}: Readonly<{ status: InstallationStatus }>) {
  const t = useTranslations("delivery.installation.statuses");
  return <StatusBadge status={TONE[status]} label={t(status)} />;
}
