"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { Link } from "@/kernel/i18n/navigation";
import { isFrontendFeatureEnabled } from "@/kernel/platform/features/enabled-feature-keys";

import { UnitIssuesSection } from "@plugins/production/production-issue/components/UnitIssuesSection";
import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";
import { ProductionOrderStatusBadge } from "@plugins/production/production-order/components/ProductionOrderStatusBadge";
import {
  PRODUCTION_REASON_MAX,
  productionOrderPageRoutes,
} from "@plugins/production/production-order/constants";
import { ProductionOrderPermission } from "@plugins/production/production-order/permissions/production-order-permission.keys";
import { progressPageRoutes } from "@plugins/production/progress/constants";
import {
  useChangeStage,
  useUnit,
} from "@plugins/production/progress/hooks/api/useProgress";
import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";
import { stageActions } from "@plugins/production/progress/utils/stage-actions";

import { UnitPhotos } from "./UnitPhotos";
import { UnitProgressCell } from "./UnitProgressCell";
import { UnitStepper } from "./UnitStepper";

import type { BreadcrumbItem } from "@/kernel/core/components/ui/Breadcrumb";
import type { ProductionStage } from "@plugins/production/progress/constants";

const ICON = "building-factory";

/** One cabinet: its six stages, started and finished in order, and undone by a manager. */
export function UnitDetailPage() {
  const t = useTranslations("production");
  const id = useEntityIdParam();
  const { can } = useAuth();
  const query = useUnit(id);
  const change = useChangeStage(id ?? 0);
  const [undoing, setUndoing] = useState<ProductionStage | null>(null);

  const unit = query.data;
  // Only who may work a cabinet opens the cabinet list; a reader goes back to the production order.
  let listCrumb: BreadcrumbItem = {
    label: t("title"),
    href: productionOrderPageRoutes.list,
    icon: ICON,
  };
  if (can(ProductionProgressPermission.update)) {
    listCrumb = {
      label: t(
        can(ProductionProgressPermission.undo) ? "workshopUnits" : "myUnits",
      ),
      href: progressPageRoutes.myUnits,
      icon: ICON,
    };
  } else if (unit) {
    listCrumb = {
      label: unit.productionOrderCode,
      href: productionOrderPageRoutes.detail(unit.productionOrderId),
      icon: ICON,
    };
  }
  const header = {
    pageTitle: t("unitTitle"),
    pageDescription: t("unitDescription"),
  };

  if (!unit) {
    const missing = !id || isNotFoundError(query.error) || query.isError;
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("unitTitle") }]}
        title={t("unitTitle")}
      >
        {missing ? (
          <EmptyState
            bordered={false}
            icon={ICON}
            message={t("unitNotFound")}
          />
        ) : (
          <LoadingState variant="list" />
        )}
      </DetailPageLayout>
    );
  }

  const actions = stageActions(unit, {
    update: can(ProductionProgressPermission.update),
    undo: can(ProductionProgressPermission.undo),
  });

  // Photos and reports are taken only while the order is released; the stage they start on is
  // the one being worked, or the last one once the cabinet is finished.
  const working = unit.productionOrderStatus === "released";
  const workStage = unit.currentStage ?? "finishing";

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: unit.code }]}
      title={unit.code}
      subtitle={unit.description ?? undefined}
    >
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("code")}>
            {can(ProductionOrderPermission.read) ? (
              <Link
                className="font-mono text-brand underline"
                href={productionOrderPageRoutes.detail(unit.productionOrderId)}
              >
                {unit.productionOrderCode}
              </Link>
            ) : (
              <span className="font-mono">{unit.productionOrderCode}</span>
            )}
          </DetailField>
          <DetailField label={t("status")}>
            <ProductionOrderStatusBadge status={unit.productionOrderStatus} />
          </DetailField>
          <DetailField label={t("units.assignee")}>
            {unit.assigneeName ?? t("units.unassigned")}
          </DetailField>
          <DetailField label={t("units.plannedEndDate")}>
            {unit.plannedEndDate
              ? formatIsoDate(unit.plannedEndDate)
              : t("emptyValue")}
          </DetailField>
          <DetailField label={t("units.progress")} span2>
            <UnitProgressCell
              doneCount={unit.doneCount}
              currentStage={unit.currentStage}
            />
          </DetailField>
        </DetailFieldGrid>
      </DetailSection>

      <DetailSection title={t("stagesTitle")}>
        <UnitStepper
          unit={unit}
          actions={actions}
          busy={change.isPending}
          onAction={(stage, action) => {
            if (action === "undo") setUndoing(stage);
            else change.mutate({ stage, action });
          }}
        />
      </DetailSection>

      <UnitPhotos
        unitId={unit.id}
        currentStage={workStage}
        canUpload={working && can(ProductionProgressPermission.update)}
      />

      {/* Sales follow progress without reading issues; asking would answer 403. */}
      {can(ProductionIssuePermission.read) &&
      isFrontendFeatureEnabled("production-issue") ? (
        <UnitIssuesSection
          unit={{ id: unit.id, code: unit.code }}
          currentStage={workStage}
          canReport={working}
        />
      ) : null}

      <CancelReasonModal
        isOpen={undoing !== null}
        title={t("undo.title", {
          stage: undoing ? t(`stages.${undoing}`) : "",
        })}
        description={t("undo.description")}
        submitLabel={t("undo.submit")}
        pending={change.isPending}
        onClose={() => setUndoing(null)}
        onConfirm={(reason) => {
          if (!undoing) return;
          change.mutate(
            { stage: undoing, action: "undo", reason },
            { onSuccess: () => setUndoing(null) },
          );
        }}
        reasonLabel={t("undo.reason")}
        placeholder={t("undo.placeholder")}
        requiredMessage={t("reason.required")}
        maxLengthMessage={t("reason.max", { max: PRODUCTION_REASON_MAX })}
        maxLength={PRODUCTION_REASON_MAX}
      />
    </DetailPageLayout>
  );
}
