"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatIsoDate, formatIsoDateTime } from "@/kernel/core/lib/formatters";

import {
  PRODUCTION_ORDER_EDITABLE_STATUSES,
  PRODUCTION_REASON_MAX,
  productionOrderPageRoutes,
} from "@plugins/production/production-order/constants";
import {
  useCancelProductionOrder,
  useProductionOrder,
  useReleaseProductionOrder,
  useTechnicianOptions,
  useUpdateProductionUnit,
} from "@plugins/production/production-order/hooks/api/useProductionOrder";
import { ProductionOrderPermission } from "@plugins/production/production-order/permissions/production-order-permission.keys";
import { productionOrderFeature } from "@plugins/production/production-order/production-order.feature";
import { unitCodesFromReleaseError } from "@plugins/production/production-order/utils/release-error";

import { ProductionOrderStatusBadge } from "./ProductionOrderStatusBadge";
import { ProductionShortagePanel } from "./ProductionShortagePanel";
import { ProductionUnitsTable } from "./ProductionUnitsTable";

type Dialog = "release" | "cancel" | null;

/**
 * One production order: its cabinets with a technician and a planned end date each, then
 * release to the workshop (every cabinet needs both) or cancel with a reason.
 */
export function ProductionOrderDetailPage() {
  const t = useTranslations("production");
  const tCommon = useTranslations("common");
  const id = useEntityIdParam();
  const { can } = useAuth();
  const query = useProductionOrder(id);
  const update = useUpdateProductionUnit(id ?? 0);
  const release = useReleaseProductionOrder(id ?? 0);
  const cancel = useCancelProductionOrder(id ?? 0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [unfinished, setUnfinished] = useState<string[]>([]);

  const order = query.data;
  const editable = order
    ? PRODUCTION_ORDER_EDITABLE_STATUSES.includes(order.status) &&
      can(ProductionOrderPermission.update)
    : false;
  const technicians = useTechnicianOptions(editable);

  const icon = productionOrderFeature.items[0]?.icon ?? "building-factory";
  const listCrumb = {
    label: t("title"),
    href: productionOrderPageRoutes.list,
    icon,
  };
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!order) {
    const missing = !id || isNotFoundError(query.error) || query.isError;
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("detailTitle") }]}
        title={t("detailTitle")}
      >
        {missing ? (
          <EmptyState bordered={false} icon={icon} message={t("notFound")} />
        ) : (
          <LoadingState variant="list" />
        )}
      </DetailPageLayout>
    );
  }

  const canRelease =
    order.status === "draft" && can(ProductionOrderPermission.release);
  const canCancel =
    PRODUCTION_ORDER_EDITABLE_STATUSES.includes(order.status) &&
    can(ProductionOrderPermission.cancel);
  const busy = [update, release, cancel].some((mutation) => mutation.isPending);
  const closeDialog = () => {
    setDialog(null);
    setUnfinished([]);
  };

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: order.code }]}
      title={order.code}
      subtitle={order.customerName ?? undefined}
    >
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("status")}>
            <ProductionOrderStatusBadge status={order.status} />
          </DetailField>
          <DetailField label={t("orderCode")}>{order.orderCode}</DetailField>
          <DetailField label={t("customer")}>
            {order.customerName ?? t("emptyValue")}
          </DetailField>
          <DetailField label={t("deliveryDate")}>
            {order.deliveryDate
              ? formatIsoDate(order.deliveryDate)
              : t("emptyValue")}
          </DetailField>
          <DetailField label={t("createdAt")}>
            {formatIsoDateTime(order.createdAt)}
          </DetailField>
          {order.releasedAt ? (
            <DetailField label={t("releasedAt")}>
              {formatIsoDateTime(order.releasedAt)}
            </DetailField>
          ) : null}
          {order.cancelReason ? (
            <DetailField label={t("cancelReason")} span2>
              {order.cancelReason}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
      </DetailSection>

      {canRelease || canCancel ? (
        <DetailSection title={t("actions.title")}>
          <div className="flex flex-wrap items-center gap-2">
            {canRelease ? (
              <DetailPanelActionButton
                variant="primary"
                icon="check"
                label={t("actions.release")}
                disabled={busy}
                onClick={() => setDialog("release")}
              />
            ) : null}
            {canCancel ? (
              <DetailPanelActionButton
                variant="danger"
                icon="ban"
                label={t("actions.cancel")}
                disabled={busy}
                onClick={() => setDialog("cancel")}
              />
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title={t("units.title")}>
        <ProductionUnitsTable
          units={order.units}
          editable={editable}
          technicians={technicians.data ?? []}
          busy={busy}
          onChange={(unitId, changes, onFailed) =>
            // The promise of each call settles even when a later change has started.
            update
              .mutateAsync({ unitId, ...changes })
              .catch(() => onFailed?.())
          }
        />
      </DetailSection>

      {order.status === "cancelled" ? null : (
        <ProductionShortagePanel id={order.id} />
      )}

      {order.events ? (
        <DetailSection title={t("history.title")}>
          {order.events.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("history.empty")}</p>
          ) : (
            <ol
              aria-label={t("history.title")}
              className="divide-y divide-border-secondary"
            >
              {[...order.events]
                .sort((a, b) => b.id - a.id)
                .map((event) => (
                  <li key={event.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="text-text-secondary">
                        {formatIsoDateTime(event.createdAt)}
                      </span>
                      <span>{event.actorName ?? t("emptyValue")}</span>
                      <span className="font-medium">
                        {t(`history.events.${event.event}`)}
                      </span>
                      {event.unitCode ? <span>{event.unitCode}</span> : null}
                      {event.stage ? (
                        <span>{t(`stages.${event.stage}`)}</span>
                      ) : null}
                      {event.severity ? (
                        <span>{t(`issues.severities.${event.severity}`)}</span>
                      ) : null}
                      {event.assigneeName ? (
                        <span>
                          {t("history.technician", {
                            name: event.assigneeName,
                          })}
                        </span>
                      ) : null}
                      {event.plannedEndDate ? (
                        <span>
                          {t("history.plannedEnd", {
                            date: formatIsoDate(event.plannedEndDate),
                          })}
                        </span>
                      ) : null}
                    </div>
                    {event.reason ? (
                      <p className="mt-1 whitespace-pre-wrap">{event.reason}</p>
                    ) : null}
                  </li>
                ))}
            </ol>
          )}
        </DetailSection>
      ) : null}

      <ConfirmDialog
        open={dialog === "release"}
        variant="default"
        icon="check"
        title={t("actions.releaseTitle", { code: order.code })}
        description={t("actions.releaseDescription")}
        confirmLabel={t("actions.release")}
        cancelLabel={tCommon("cancel")}
        pending={release.isPending}
        onCancel={closeDialog}
        onConfirm={() =>
          release.mutate(undefined, {
            onSuccess: closeDialog,
            onError: (error) => setUnfinished(unitCodesFromReleaseError(error)),
          })
        }
      >
        {unfinished.length > 0 ? (
          <p role="alert" className="text-sm text-danger-text">
            {t("actions.releaseIncomplete", { codes: unfinished.join(", ") })}
          </p>
        ) : null}
      </ConfirmDialog>
      <CancelReasonModal
        isOpen={dialog === "cancel"}
        title={t("actions.cancelTitle", { code: order.code })}
        description={
          order.status === "released"
            ? t("actions.cancelReleasedWarning")
            : null
        }
        submitLabel={t("actions.cancel")}
        pending={cancel.isPending}
        onClose={closeDialog}
        onConfirm={(reason) =>
          cancel.mutate(reason, { onSuccess: closeDialog })
        }
        reasonLabel={t("reason.label")}
        placeholder={t("reason.placeholder")}
        requiredMessage={t("reason.required")}
        maxLengthMessage={t("reason.max", { max: PRODUCTION_REASON_MAX })}
        maxLength={PRODUCTION_REASON_MAX}
      />
    </DetailPageLayout>
  );
}
