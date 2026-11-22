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
import { displayDetailValue } from "@/kernel/core/lib/display-detail-value";
import { Link } from "@/kernel/i18n/navigation";
import { isFrontendFeatureEnabled } from "@/kernel/platform/features/enabled-feature-keys";

import { AcceptanceSection } from "@plugins/delivery/acceptance/components/AcceptanceSection";
import { AcceptancePermission } from "@plugins/delivery/acceptance/permissions/acceptance-permission.keys";
import { deliveryNotePageRoutes } from "@plugins/delivery/delivery-note/constants";
import { useDeliveryOrder } from "@plugins/delivery/delivery-note/hooks/api/useDeliveryNote";
import { InstallationSection } from "@plugins/delivery/installation/components/InstallationSection";
import { InstallationPermission } from "@plugins/delivery/installation/permissions/installation-permission.keys";
import { QcUnitStatusBadge } from "@plugins/delivery/qc-inspection/components/QcStatusBadge";
import { OrderStatusBadge } from "@plugins/sales/order/components/OrderStatusBadge";

import {
  DeliveryNoteStatusBadge,
  UnitDeliveryStatusBadge,
} from "./DeliveryNoteStatusBadge";

import type { OrderStatus } from "@plugins/sales/order/constants";

const ICON = "truck";

/**
 * One order's delivery page, read with `delivery_note:read` alone: the order's cabinets with
 * their QC and delivery status, and its delivery notes. It shows no price.
 */
export function OrderDeliveryPage() {
  const t = useTranslations("delivery");
  const orderId = useEntityIdParam("orderId");
  const { can } = useAuth();
  const query = useDeliveryOrder(orderId);

  const order = query.data;
  const listCrumb = {
    label: t("note.title"),
    href: deliveryNotePageRoutes.list,
    icon: ICON,
  };
  const header = {
    pageTitle: t("note.title"),
    pageDescription: t("orderPage.description"),
  };

  if (!order) {
    const missing = !orderId || isNotFoundError(query.error) || query.isError;
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("orderPage.title") }]}
        title={t("orderPage.title")}
      >
        {missing ? (
          <EmptyState
            bordered={false}
            icon={ICON}
            message={t("orderPage.notFound")}
          />
        ) : (
          <LoadingState variant="list" />
        )}
      </DetailPageLayout>
    );
  }

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: order.code }]}
      title={order.code}
      subtitle={t("orderPage.title")}
    >
      <DetailSection title={t("orderPage.info")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("note.columns.order")}>
            <span className="font-mono">{order.code}</span>
          </DetailField>
          <DetailField label={t("orderPage.status")}>
            <OrderStatusBadge status={order.status as OrderStatus} />
          </DetailField>
          <DetailField label={t("note.columns.customer")}>
            {order.customerName}
          </DetailField>
          <DetailField label={t("note.fields.project")}>
            {displayDetailValue(order.projectName, t("emptyValue"))}
          </DetailField>
        </DetailFieldGrid>
      </DetailSection>

      <DetailSection title={t("orderPage.units")}>
        {order.units.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("orderPage.noUnits")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {order.units.map((unit) => (
              <li
                key={unit.unitId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-secondary p-2 text-sm"
              >
                <span>
                  <span className="font-mono">{unit.code}</span> · {unit.tag}
                  {unit.deliveryNoteCode ? ` (${unit.deliveryNoteCode})` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <QcUnitStatusBadge status={unit.qcStatus} />
                  <UnitDeliveryStatusBadge status={unit.deliveryStatus} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection title={t("orderPage.notes")}>
        {order.notes.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("orderPage.noNotes")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {order.notes.map((note) => (
              <li
                key={note.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-secondary p-2 text-sm"
              >
                <Link
                  className="font-mono text-brand underline"
                  href={deliveryNotePageRoutes.detail(note.id)}
                >
                  {note.code}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  {t("orderPage.noteUnits", { count: note.unitCount })}
                  <DeliveryNoteStatusBadge status={note.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {can(InstallationPermission.read) &&
      isFrontendFeatureEnabled("installation") ? (
        <InstallationSection
          orderId={order.orderId}
          orderStatus={order.status}
          siteAddress={order.siteAddress}
        />
      ) : null}
      {can(AcceptancePermission.read) ? (
        <AcceptanceSection orderId={order.orderId} orderStatus={order.status} />
      ) : null}
    </DetailPageLayout>
  );
}
