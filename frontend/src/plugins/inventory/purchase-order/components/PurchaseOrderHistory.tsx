"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import type { PurchaseOrderEvent } from "@plugins/inventory/purchase-order/types";

/** Every decision on the order, oldest first, with the reason given for a rejection. */
export function PurchaseOrderHistory({
  events,
}: {
  events: PurchaseOrderEvent[];
}) {
  const t = useTranslations("purchaseOrder");
  return (
    <DetailSection title={t("history.title")}>
      {events.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("history.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col">
              <span>
                <span className="font-semibold">
                  {t(`history.events.${event.event}`)}
                </span>
                {` — ${event.actorName ?? t("emptyValue")} · ${formatIsoDateTime(event.createdAt)}`}
              </span>
              {event.reason ? (
                <span className="text-text-secondary">
                  {t("history.reason", { reason: event.reason })}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
