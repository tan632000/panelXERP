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
import {
  formatCurrency,
  formatIsoDate,
  formatIsoDateTime,
} from "@/kernel/core/lib/formatters";

import { IssuePermission } from "@plugins/inventory/issue/permissions/issue-permission.keys";
import { purchaseOrderPageRoutes } from "@plugins/inventory/purchase-order/constants";
import {
  usePurchaseOrder,
  useUpdatePurchaseOrder,
} from "@plugins/inventory/purchase-order/hooks/api/usePurchaseOrder";
import { purchaseOrderFeature } from "@plugins/inventory/purchase-order/purchase-order.feature";
import { purchaseOrderActions } from "@plugins/inventory/purchase-order/utils/purchase-order-actions";
import { SupplierReturnHistory } from "@plugins/inventory/supplier-return/components/SupplierReturnHistory";

import { PurchaseOrderActionPanel } from "./PurchaseOrderActionPanel";
import { PurchaseOrderEditor } from "./PurchaseOrderEditor";
import { PurchaseOrderHistory } from "./PurchaseOrderHistory";
import { PurchaseOrderLinesTable } from "./PurchaseOrderLinesTable";
import { PurchaseOrderStatusBadge } from "./PurchaseOrderStatusBadge";

export function PurchaseOrderDetailPage() {
  const t = useTranslations("purchaseOrder");
  const orderId = useEntityIdParam();
  const { can, user } = useAuth();
  const query = usePurchaseOrder(orderId);
  const save = useUpdatePurchaseOrder(orderId ?? 0);

  const order = query.data;
  const icon = purchaseOrderFeature.items[0]?.icon ?? "file-invoice";
  const listCrumb = {
    label: t("title"),
    href: purchaseOrderPageRoutes.list,
    icon,
  };
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!order) {
    const missing =
      !orderId ||
      isNotFoundError(query.error) ||
      (!query.isLoading && !query.isError);
    let body: React.ReactNode = <LoadingState variant="list" />;
    if (missing) {
      body = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("detailNotFound")}
        />
      );
    } else if (query.isError) {
      body = (
        <EmptyState
          bordered={false}
          icon="alert"
          message={t("toast.systemError")}
        />
      );
    }
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("detailTitle") }]}
        title={t("detailTitle")}
      >
        {body}
      </DetailPageLayout>
    );
  }

  // The API sends money keys only to an actor holding `purchase_price:read`.
  const showCosts = "total" in order;
  const editable = purchaseOrderActions(order, can, user?.id).edit;

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: order.code }]}
      title={order.code}
      subtitle={`${order.supplierCode} — ${order.supplierName}`}
    >
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("status")}>
            <PurchaseOrderStatusBadge status={order.status} />
          </DetailField>
          <DetailField label={t("expectedDate")}>
            {order.expectedDate
              ? formatIsoDate(order.expectedDate)
              : t("emptyValue")}
          </DetailField>
          <DetailField label={t("createdBy")}>
            {order.createdByName ?? t("emptyValue")}
          </DetailField>
          <DetailField label={t("createdAt")}>
            {formatIsoDateTime(order.createdAt)}
          </DetailField>
          {showCosts ? (
            <>
              <DetailField
                label={t("vatRate")}
              >{`${order.vatRate}%`}</DetailField>
              <DetailField label={t("total")}>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(order.total)}
                </span>
              </DetailField>
            </>
          ) : null}
          {order.note ? (
            <DetailField label={t("note")} span2>
              {order.note}
            </DetailField>
          ) : null}
          {order.cancelReason ? (
            <DetailField label={t("cancelReason")} span2>
              {order.cancelReason}
            </DetailField>
          ) : null}
          {order.closeReason ? (
            <DetailField label={t("closeReason")} span2>
              {order.closeReason}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
      </DetailSection>

      <PurchaseOrderActionPanel order={order} />

      {editable ? (
        <PurchaseOrderEditor
          key={`${order.id}-${order.lines.map((line) => line.id).join("-")}`}
          order={order}
          pending={save.isPending}
          onSave={(input) => save.mutate(input)}
        />
      ) : (
        <DetailSection title={t("lines.title")}>
          <PurchaseOrderLinesTable lines={order.lines} showCosts={showCosts} />
        </DetailSection>
      )}

      {can(IssuePermission.returnRead) ? (
        <SupplierReturnHistory purchaseOrderId={order.id} />
      ) : null}

      <PurchaseOrderHistory events={order.events} />
    </DetailPageLayout>
  );
}
