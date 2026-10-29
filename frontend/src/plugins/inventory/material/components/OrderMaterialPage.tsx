"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import {
  formatIsoDate,
  formatIsoDateTime,
  formatNumber,
} from "@/kernel/core/lib/formatters";
import { useRouter } from "@/kernel/i18n/navigation";

import { issuePageRoutes } from "@plugins/inventory/issue/constants";
import { IssuePermission } from "@plugins/inventory/issue/permissions/issue-permission.keys";
import { materialPageRoutes } from "@plugins/inventory/material/constants";
import { useOrderMaterial } from "@plugins/inventory/material/hooks/api/useMaterial";
import { materialFeature } from "@plugins/inventory/material/material.feature";
import { purchaseRequestPageRoutes } from "@plugins/inventory/purchase-request/constants";
import { useRequestFromOrder } from "@plugins/inventory/purchase-request/hooks/api/usePurchaseRequest";
import { PurchaseRequestPermission } from "@plugins/inventory/purchase-request/permissions/purchase-request-permission.keys";
import { OrderStatusBadge } from "@plugins/sales/order/components/OrderStatusBadge";

import type {
  MaterialItemRow,
  MaterialPanel,
  OverBomIssue,
  UnlinkedBomLine,
} from "@plugins/inventory/material/types";

/** Orders the workshop may return materials from (user, Q7). */
const RETURNABLE = ["open", "cancelled"];

const PLAIN = { filterable: false, sortable: false } as const;
const QUANTITY = { maximumFractionDigits: 3 };

const quantity = (value: number) => (
  <span className="tabular-nums">{formatNumber(value, QUANTITY)}</span>
);

/** One order's materials: per item what is needed, set aside, issued and still short. */
export function OrderMaterialPage() {
  const t = useTranslations("material");
  const { can } = useAuth();
  const router = useRouter();
  const orderId = useEntityIdParam();
  const requestPurchase = useRequestFromOrder();
  const query = useOrderMaterial(orderId);
  const detail = query.data;
  const icon = materialFeature.items[0]?.icon ?? "package";
  const header = { pageTitle: t("title"), pageDescription: t("description") };
  const listCrumb = { label: t("title"), href: materialPageRoutes.list, icon };

  if (!detail) {
    let body: React.ReactNode = <LoadingState variant="list" />;
    if (!orderId || isNotFoundError(query.error)) {
      body = (
        <EmptyState bordered={false} icon={icon} message={t("notFound")} />
      );
    } else if (query.isError) {
      body = (
        <EmptyState bordered={false} icon="alert" message={t("loadError")} />
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

  const { order } = detail;
  const itemColumns: Array<TableColumn<MaterialItemRow>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("item.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("item.name") },
    { key: "itemUnit", ...PLAIN, header: t("item.unit") },
    {
      key: "demand",
      ...PLAIN,
      header: t("item.demand"),
      render: (_, row) => quantity(row.demand),
    },
    {
      key: "reserved",
      ...PLAIN,
      header: t("item.reserved"),
      render: (_, row) => quantity(row.reserved),
    },
    {
      key: "issued",
      ...PLAIN,
      header: t("item.issued"),
      render: (_, row) => quantity(row.issued),
    },
    {
      key: "returned",
      ...PLAIN,
      header: t("item.returned"),
      render: (_, row) => quantity(row.returned),
    },
    {
      key: "short",
      ...PLAIN,
      header: t("item.short"),
      render: (_, row) => (
        <span
          className={
            row.short > 0
              ? "font-semibold text-danger-text tabular-nums"
              : "tabular-nums"
          }
          data-testid={`short-${row.itemId}`}
        >
          {formatNumber(row.short, QUANTITY)}
        </span>
      ),
    },
  ];
  const panelColumns: Array<TableColumn<MaterialPanel["bomLines"][number]>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("item.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("item.name") },
    { key: "itemUnit", ...PLAIN, header: t("item.unit") },
    {
      key: "perPanelQuantity",
      ...PLAIN,
      header: t("panel.perPanel"),
      render: (_, row) => quantity(row.perPanelQuantity),
    },
    {
      key: "demand",
      ...PLAIN,
      header: t("item.demand"),
      render: (_, row) => quantity(row.demand),
    },
  ];
  const unlinkedColumns: Array<TableColumn<UnlinkedBomLine>> = [
    { key: "tag", ...PLAIN, header: t("panel.tag") },
    {
      key: "itemCode",
      ...PLAIN,
      header: t("item.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("item.name") },
    {
      key: "perPanelQuantity",
      ...PLAIN,
      header: t("panel.perPanel"),
      render: (_, row) => quantity(row.perPanelQuantity),
    },
  ];

  const canIssue = order.status === "open" && can(IssuePermission.create);
  const canReturn =
    RETURNABLE.includes(order.status) && can(IssuePermission.returnCreate);
  const canRequest =
    order.status === "open" &&
    detail.items.some((item) => item.short > 0) &&
    can(PurchaseRequestPermission.create);
  const overBomColumns: Array<TableColumn<OverBomIssue>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("item.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("item.name") },
    {
      key: "quantity",
      ...PLAIN,
      header: t("overBom.quantity"),
      render: (_, row) => quantity(row.quantity),
    },
    { key: "reason", ...PLAIN, header: t("overBom.reason") },
    {
      key: "issuedAt",
      ...PLAIN,
      header: t("overBom.issuedAt"),
      render: (_, row) => formatIsoDateTime(row.issuedAt),
    },
  ];

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: order.code }]}
      title={order.code}
      subtitle={order.customerName}
    >
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("status")}>
            <OrderStatusBadge status={order.status} />
          </DetailField>
          <DetailField label={t("deliveryDate")}>
            {order.deliveryDate
              ? formatIsoDate(order.deliveryDate)
              : t("emptyValue")}
          </DetailField>
          <DetailField label={t("project")}>
            {order.projectName ?? t("emptyValue")}
          </DetailField>
          <DetailField label={t("salesOwner")}>
            {order.salesOwnerName ?? t("emptyValue")}
          </DetailField>
        </DetailFieldGrid>
        {!detail.demandBearing ? (
          <p className="mt-3 text-sm text-text-secondary">{t("noDemand")}</p>
        ) : null}
      </DetailSection>

      {canIssue || canReturn || canRequest ? (
        <DetailSection title={t("actions.title")}>
          <div className="flex flex-wrap items-center gap-2">
            {canIssue ? (
              <DetailPanelActionButton
                variant="primary"
                icon="package-export"
                label={t("actions.issue")}
                onClick={() => router.push(issuePageRoutes.issue(order.id))}
              />
            ) : null}
            {canRequest ? (
              <DetailPanelActionButton
                icon="clipboard-list"
                label={t("actions.requestPurchase")}
                disabled={requestPurchase.isPending}
                onClick={() =>
                  requestPurchase.mutate(order.id, {
                    onSuccess: () => router.push(purchaseRequestPageRoutes.list),
                  })
                }
              />
            ) : null}
            {canReturn ? (
              <DetailPanelActionButton
                icon="package-import"
                label={t("actions.workshopReturn")}
                onClick={() =>
                  router.push(issuePageRoutes.workshopReturn(order.id))
                }
              />
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title={t("itemsTitle")}>
        <Table
          columns={itemColumns}
          data={detail.items}
          rowKey={(row) => String(row.itemId)}
        />
      </DetailSection>

      {detail.unlinked.length > 0 ? (
        <DetailSection title={t("unlinkedTitle")}>
          <p
            role="alert"
            className="mb-3 rounded-md border border-warning-bg bg-warning-bg px-3 py-2 text-sm text-warning-text"
          >
            {t("unlinkedWarning")}
          </p>
          <Table
            columns={unlinkedColumns}
            data={detail.unlinked}
            rowKey={(row) => String(row.bomLineId)}
          />
        </DetailSection>
      ) : null}

      {detail.overBomIssues.length > 0 ? (
        <DetailSection title={t("overBom.title")}>
          <Table
            columns={overBomColumns}
            data={detail.overBomIssues}
            rowKey={(row) => row.movementId}
          />
        </DetailSection>
      ) : null}

      {detail.panels.map((panel) => (
        <DetailSection
          key={panel.lineId}
          title={t("panel.title", { tag: panel.tag, quantity: panel.quantity })}
        >
          <Table
            columns={panelColumns}
            data={panel.bomLines}
            rowKey={(row) => String(row.bomLineId)}
          />
        </DetailSection>
      ))}
    </DetailPageLayout>
  );
}
