"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";

import { qcPageRoutes } from "@plugins/delivery/qc-inspection/constants";
import { useQcUnit } from "@plugins/delivery/qc-inspection/hooks/api/useQcInspection";
import { QcInspectionPermission } from "@plugins/delivery/qc-inspection/permissions/qc-inspection-permission.keys";

import { QcRoundForm } from "./QcRoundForm";
import { QcRoundHistory } from "./QcRoundHistory";
import { QcDefectStatusBadge, QcUnitStatusBadge } from "./QcStatusBadge";

const ICON = "clipboard-list";

/** One cabinet: its QC status, the rounds so far, its defects, and the form of a new round. */
export function QcUnitPage() {
  const t = useTranslations("delivery");
  const unitId = useEntityIdParam("unitId");
  const { can } = useAuth();
  const query = useQcUnit(unitId);

  const unit = query.data;
  const listCrumb = {
    label: t("qc.title"),
    href: qcPageRoutes.list,
    icon: ICON,
  };
  const header = {
    pageTitle: t("qc.unit.title"),
    pageDescription: t("qc.unit.description"),
  };

  if (!unit) {
    const missing = !unitId || isNotFoundError(query.error) || query.isError;
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("qc.unit.title") }]}
        title={t("qc.unit.title")}
      >
        {missing ? (
          <EmptyState
            bordered={false}
            icon={ICON}
            message={t("qc.unit.notFound")}
          />
        ) : (
          <LoadingState variant="list" />
        )}
      </DetailPageLayout>
    );
  }

  // A new round only on a cabinet that is waiting or failed, once every defect is verified.
  const openDefect = unit.defects.some((defect) => defect.status !== "verified");
  const canRecord =
    can(QcInspectionPermission.create) &&
    (unit.qcStatus === "waiting" || unit.qcStatus === "failed") &&
    !openDefect;

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: unit.code }]}
      title={unit.code}
      subtitle={unit.description ?? undefined}
    >
      <DetailSection title={t("qc.unit.info")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("qc.columns.tag")}>{unit.tag}</DetailField>
          <DetailField label={t("qc.columns.status")}>
            <QcUnitStatusBadge status={unit.qcStatus} />
          </DetailField>
          <DetailField label={t("qc.columns.productionOrder")}>
            <span className="font-mono">{unit.productionOrderCode}</span>
          </DetailField>
          <DetailField label={t("qc.columns.order")}>
            {unit.orderCode ?? t("emptyValue")}
          </DetailField>
          <DetailField label={t("qc.columns.customer")} span2>
            {unit.customerName ?? t("emptyValue")}
          </DetailField>
        </DetailFieldGrid>
      </DetailSection>

      {canRecord ? <QcRoundForm unitId={unit.unitId} /> : null}
      {can(QcInspectionPermission.create) && openDefect ? (
        <p className="text-sm text-text-secondary">
          {t("qc.unit.defectsBlock")}
        </p>
      ) : null}

      <QcRoundHistory rounds={unit.rounds} />

      <DetailSection title={t("qc.unit.defects")}>
        {unit.defects.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("qc.unit.noDefects")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unit.defects.map((defect) => (
              <li
                key={defect.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-secondary p-2 text-sm"
              >
                <span>
                  {t("qc.unit.roundTitle", { no: defect.roundNo })}:{" "}
                  {defect.description}
                </span>
                <QcDefectStatusBadge status={defect.status} />
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </DetailPageLayout>
  );
}
