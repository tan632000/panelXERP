"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import { useIssueList } from "@plugins/production/production-issue/hooks/api/useProductionIssue";
import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";

import { IssueSeverityBadge, IssueStatusBadge } from "./IssueBadges";
import { IssueFormDialog } from "./IssueFormDialog";
import { IssueResolveDialog } from "./IssueResolveDialog";

import type { ProductionIssue } from "@plugins/production/production-issue/types";
import type { ProductionStage } from "@plugins/production/progress/constants";

interface Props {
  unit: { id: number; code: string };
  /** The stage a new report starts on. */
  currentStage: ProductionStage;
  /** Reports are taken only while the production order is released. */
  canReport: boolean;
}

const BUTTON =
  "h-9 rounded-[7px] border border-border-secondary px-3 text-sm font-semibold hover:bg-surface-secondary disabled:opacity-50";

/** The problems reported on one cabinet, with the report and resolve controls. */
export function UnitIssuesSection({
  unit,
  currentStage,
  canReport,
}: Readonly<Props>) {
  const t = useTranslations("production");
  const { can } = useAuth();
  const issues = useIssueList({ unitId: unit.id, limit: 50 });
  const [reporting, setReporting] = useState(false);
  const [resolving, setResolving] = useState<ProductionIssue | null>(null);
  const rows = issues.data?.data ?? [];

  return (
    <DetailSection
      title={t("issues.title")}
      action={
        canReport && can(ProductionIssuePermission.create) ? (
          <button
            type="button"
            className={BUTTON}
            onClick={() => setReporting(true)}
          >
            {t("issues.report")}
          </button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("issues.noneOnUnit")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((issue) => (
            <li
              key={issue.id}
              className="flex flex-wrap items-start gap-3 rounded-[10px] border border-border-secondary p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  {t(`stages.${issue.stage}`)}
                </p>
                <p className="whitespace-pre-line text-sm">
                  {issue.description}
                </p>
                <p className="text-xs text-text-tertiary">
                  {t("issues.reportedBy", {
                    name: issue.reportedByName ?? t("emptyValue"),
                    time: formatIsoDateTime(issue.createdAt),
                  })}
                </p>
                {issue.resolution ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">
                    {t("issues.resolvedWith", {
                      name: issue.resolvedByName ?? t("emptyValue"),
                      resolution: issue.resolution,
                    })}
                  </p>
                ) : null}
              </div>
              <IssueSeverityBadge severity={issue.severity} />
              <IssueStatusBadge status={issue.status} />
              {issue.status === "open" &&
              can(ProductionIssuePermission.resolve) ? (
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => setResolving(issue)}
                >
                  {t("issues.resolveButton")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <IssueFormDialog
        isOpen={reporting}
        unit={unit}
        defaultStage={currentStage}
        onClose={() => setReporting(false)}
      />
      <IssueResolveDialog
        issue={resolving}
        onClose={() => setResolving(null)}
      />
    </DetailSection>
  );
}
