"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatIsoDate, formatNumber } from "@/kernel/core/lib/formatters";

import { materialPageRoutes } from "@plugins/inventory/material/constants";
import { useOrderMaterial } from "@plugins/inventory/material/hooks/api/useMaterial";
import { materialFeature } from "@plugins/inventory/material/material.feature";
import { OrderStatusBadge } from "@plugins/sales/order/components/OrderStatusBadge";

import type {
  MaterialItemRow,
  MaterialPanel,
  UnlinkedBomLine,
} from "@plugins/inventory/material/types";

const PLAIN = { filterable: false, sortable: false } as const;
const QUANTITY = { maximumFractionDigits: 3 };

const quantity = (value: number) => (
  <span className="tabular-nums">{formatNumber(value, QUANTITY)}</span>
);

/** One order's materials: per item what is needed, set aside, issued and still short. */
export function OrderMaterialPage() {
  const t = useTranslations("material");
  const orderId = useEntityIdParam();
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
