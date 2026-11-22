"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";

import type {
  DeliveryNoteStatus,
  UnitDeliveryStatus,
} from "@plugins/delivery/delivery-note/constants";

/** The kernel badge styles by its own status names; these are the nearest tones. */
const NOTE_TONE: Record<DeliveryNoteStatus, string> = {
  draft: "draft",
  shipped: "dispatched",
  received: "delivered",
  cancelled: "cancelled",
};

export function DeliveryNoteStatusBadge({
  status,
}: Readonly<{ status: DeliveryNoteStatus }>) {
  const t = useTranslations("delivery.note.statuses");
  return <StatusBadge status={NOTE_TONE[status]} label={t(status)} />;
}

/** A cabinet's delivery status: the status of its live note, or none. */
export function UnitDeliveryStatusBadge({
  status,
}: Readonly<{ status: UnitDeliveryStatus }>) {
  const t = useTranslations("delivery.note.unitStatuses");
  return (
    <StatusBadge
      status={status === "none" ? "draft" : NOTE_TONE[status]}
      label={t(status)}
    />
  );
}
