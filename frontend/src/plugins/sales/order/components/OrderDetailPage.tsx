"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { displayDetailValue } from "@/kernel/core/lib/display-detail-value";
import {
  formatCurrency,
  formatIsoDate,
  formatIsoDateTime,
} from "@/kernel/core/lib/formatters";

import { REASON_MAX, orderPageRoutes } from "@plugins/sales/order/constants";
import {
  useCancelOrder,
  useOrder,
} from "@plugins/sales/order/hooks/api/useOrder";
import { orderFeature } from "@plugins/sales/order/order.feature";
import { OrderPermission } from "@plugins/sales/order/permissions/order.permissions";

import { OrderChain } from "./OrderChain";
import { OrderHeaderEditor } from "./OrderHeaderEditor";
import { OrderLines } from "./OrderLines";
import { OrderStatusBadge } from "./OrderStatusBadge";

export function OrderDetailPage() {
  const t = useTranslations("order");
  const orderId = useEntityIdParam();
  const { can } = useAuth();
  const [cancelling, setCancelling] = useState(false);

  const orderQuery = useOrder(orderId);
  const cancel = useCancelOrder(orderId ?? 0);

  const order = orderQuery.data;
  const icon = orderFeature.items[0]?.icon ?? "clipboard-list";
  const isMissing =
    !orderId ||
    isNotFoundError(orderQuery.error) ||
    (!orderQuery.isLoading && !orderQuery.isError && !order);

  const listCrumb = { label: t("title"), href: orderPageRoutes.list, icon };
  const pageHeader = {
    pageTitle: t("title"),
    pageDescription: t("description"),
  };

  if (!order) {
    let fallback: React.ReactNode;
    if (orderId && orderQuery.isLoading) {
      fallback = <LoadingState variant="list" />;
    } else if (isMissing) {
      fallback = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("detailNotFound")}
        />
      );
    } else {
      fallback = (
        <EmptyState
          bordered={false}
          icon="alert"
          message={t("toast.systemError")}
        />
      );
    }
    return (
      <DetailPageLayout
        {...pageHeader}
        breadcrumbs={[listCrumb, { label: t("detailTitle") }]}
        title={t("detailTitle")}
      >
        {fallback}
      </DetailPageLayout>
    );
  }

  const empty = t("emptyValue");
  const value = (text?: string | null) => displayDetailValue(text, empty);
  const isOpen = order.status === "open";

  return (
    <DetailPageLayout
      {...pageHeader}
      breadcrumbs={[listCrumb, { label: order.code }]}
      title={order.code}
      subtitle={order.chain.request.title}
    >
      <DetailSection title={t("chain.title")}>
        <OrderChain chain={order.chain} orderCode={order.code} />
      </DetailSection>

      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField
            label={t("code")}
            valueClassName="font-mono font-semibold"
          >
            {order.code}
          </DetailField>
          <DetailField label={t("status")}>
            <OrderStatusBadge status={order.status} />
          </DetailField>
          <DetailField label={t("customer")}>{order.customerName}</DetailField>
          <DetailField label={t("taxCode")}>
            {value(order.customerTaxCode)}
          </DetailField>
          <DetailField label={t("address")} spanFull>
            {value(order.customerAddress)}
          </DetailField>
          <DetailField label={t("project")}>
            {value(order.projectName)}
          </DetailField>
          <DetailField label={t("total")}>
            <span className="font-semibold tabular-nums">
              {formatCurrency(order.total)}
            </span>
          </DetailField>
          {order.createdAt ? (
            <DetailField label={t("createdAt")}>
              {formatIsoDateTime(order.createdAt)}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
        {order.status === "cancelled" ? (
          <p className="mt-3 text-sm" role="status">
            <span className="font-semibold">{t("cancelledReason")}</span>{" "}
            {order.cancelReason}
            {order.cancelledAt
              ? ` (${formatIsoDate(order.cancelledAt)}${order.cancelledByName ? `, ${order.cancelledByName}` : ""})`
              : ""}
          </p>
        ) : null}
        {isOpen && can(OrderPermission.cancel) ? (
          <div className="mt-3 flex justify-end">
            <DetailPanelActionButton
              variant="danger"
              icon="ban"
              label={t("cancel")}
              disabled={cancel.isPending}
              onClick={() => setCancelling(true)}
            />
          </div>
        ) : null}
      </DetailSection>

      <OrderHeaderEditor
        key={`${order.contractNo}|${order.contractDate}|${order.deliveryDate}|${order.status}`}
        order={order}
        editable={isOpen && can(OrderPermission.update)}
      />

      <OrderLines order={order} />

      <CancelReasonModal
        isOpen={cancelling}
        title={t("cancelTitle", { code: order.code })}
        description={t("cancelDescription")}
        submitLabel={t("cancelSubmit")}
        pending={cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) =>
          cancel.mutate(reason, { onSuccess: () => setCancelling(false) })
        }
        reasonLabel={t("reason.label")}
        placeholder={t("reason.placeholder")}
        requiredMessage={t("reason.required")}
        maxLengthMessage={t("reason.max", { max: REASON_MAX })}
        maxLength={REASON_MAX}
      />
    </DetailPageLayout>
  );
}

export default OrderDetailPage;
