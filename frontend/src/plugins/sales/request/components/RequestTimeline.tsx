"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import { useRequestActivities } from "@plugins/sales/request/hooks/api/useRequest";

import type { RequestActivity } from "@plugins/sales/request/types";

/** The sentence of one timeline entry, from its action and the statuses it moved between. */
function useActivityText() {
  const t = useTranslations("request");
  return (activity: RequestActivity): string => {
    if (activity.action === "status_changed" && activity.toStatus) {
      return t("timeline.statusChanged", {
        status: t(`statuses.${activity.toStatus}`),
      });
    }
    const known = [
      "created",
      "updated",
      "assigned",
      "reassigned",
      "owner_changed",
      "attachment_added",
      "attachment_removed",
    ];
    return known.includes(activity.action)
      ? t(`timeline.${activity.action}`)
      : activity.action;
  };
}

export function RequestTimeline({ requestId }: { requestId: number }) {
  const t = useTranslations("request");
  const activitiesQuery = useRequestActivities(requestId);
  const describe = useActivityText();
  const activities = activitiesQuery.data ?? [];

  return (
    <DetailSection title={t("timeline.title")}>
      {activities.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("timeline.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex flex-col gap-0.5 border-l-2 border-border-secondary pl-3"
            >
              <span className="text-sm font-medium text-text-primary">
                {describe(activity)}
                {activity.note ? (
                  <span className="font-normal text-text-secondary">
                    {" "}
                    — {activity.note}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-text-tertiary">
                {[activity.actorName, formatIsoDateTime(activity.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
