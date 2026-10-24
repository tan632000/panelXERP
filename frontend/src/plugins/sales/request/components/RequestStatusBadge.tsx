"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type { RequestStatus } from "@plugins/sales/request/constants";

export function RequestStatusBadge({
  status,
  size,
}: {
  status: RequestStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("request.statuses");
  return <StatusBadge status={status} label={t(status)} size={size} />;
}
