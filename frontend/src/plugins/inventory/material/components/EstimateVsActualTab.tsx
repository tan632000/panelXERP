"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import {
  formatCurrency,
  formatIsoDateTime,
  formatNumber,
} from "@/kernel/core/lib/formatters";

import { useEstimateVsActual } from "@plugins/inventory/material/hooks/api/useMaterial";

import type {
  EstimateVsActualReport,
  EstimateVsActualRow,
} from "@plugins/inventory/material/types";

const PLAIN = { filterable: false, sortable: false } as const;
const QUANTITY = { maximumFractionDigits: 3 };

const quantity = (value: number) => (
  <span className="tabular-nums">{formatNumber(value, QUANTITY)}</span>
);
const variance = (value: number, render: (value: number) => React.ReactNode) => (
  <span className={value > 0 ? "text-danger-text" : undefined}>{render(value)}</span>
);

/**
 * Estimate against actual of one order: per item the BOM quantity next to what went to the
 * workshop net of returns, every over-BOM issue with its reason, and — only for a reader the
 * API sent costs to — the estimated and actual cost.
 */
export function EstimateVsActualTab({ orderId }: { orderId: number }) {
  const t = useTranslations("material.estimateVsActual");
  const query = useEstimateVsActual(orderId);
  const report = query.data;

  if (!report) {
    return query.isError ? (
      <EmptyState bordered={false} icon="alert" message={t("loadError")} />
    ) : (
      <LoadingState variant="list" />
    );
  }

  // The API sends the cost keys only to a reader holding `purchase_price:read`.
  const showCosts = report.totals !== undefined;
  const money = (value: number | undefined) =>
    value === undefined ? null : (
      <span className="tabular-nums">{formatCurrency(value)}</span>
    );

  const columns: Array<TableColumn<EstimateVsActualRow>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("columns.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("columns.name") },
    { key: "itemUnit", ...PLAIN, header: t("columns.unit") },
    {
      key: "estimatedQty",
      ...PLAIN,
      header: t("columns.estimatedQty"),
      render: (_, row) => quantity(row.estimatedQty),
    },
    {
      key: "actualQty",
      ...PLAIN,
      header: t("columns.actualQty"),
      render: (_, row) => quantity(row.actualQty),
    },
    {
      key: "qtyVariance",
      ...PLAIN,
      header: t("columns.qtyVariance"),
      render: (_, row) => variance(row.qtyVariance, quantity),
    },
    ...(showCosts
      ? ([
          {
            key: "estimatedCost",
            ...PLAIN,
            header: t("columns.estimatedCost"),
            render: (_, row) => money(row.estimatedCost),
          },
          {
            key: "actualCost",
            ...PLAIN,
            header: t("columns.actualCost"),
            render: (_, row) => money(row.actualCost),
          },
          {
            key: "costVariance",
            ...PLAIN,
            header: t("columns.costVariance"),
            render: (_, row) =>
              row.costVariance === undefined
                ? null
                : variance(row.costVariance, (value) => money(value)),
          },
        ] satisfies Array<TableColumn<EstimateVsActualRow>>)
      : []),
  ];

  const overBomColumns: Array<
    TableColumn<EstimateVsActualReport["overBomIssues"][number]>
  > = [
    {
      key: "issueCode",
      ...PLAIN,
      header: t("overBom.issueCode"),
      render: (_, row) => <span className="font-mono">{row.issueCode}</span>,
    },
    {
      key: "issuedAt",
      ...PLAIN,
      header: t("overBom.issuedAt"),
      render: (_, row) => formatIsoDateTime(row.issuedAt),
    },
    {
      key: "itemCode",
      ...PLAIN,
      header: t("columns.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    {
      key: "quantity",
      ...PLAIN,
      header: t("overBom.quantity"),
      render: (_, row) => quantity(row.quantity),
    },
    { key: "reason", ...PLAIN, header: t("overBom.reason") },
    {
      key: "panelTag",
      ...PLAIN,
      header: t("overBom.panel"),
      render: (_, row) => row.panelTag ?? t("emptyValue"),
    },
  ];

  const unlinkedColumns: Array<
    TableColumn<EstimateVsActualReport["unlinked"][number]>
  > = [
    { key: "panelTag", ...PLAIN, header: t("overBom.panel") },
    {
      key: "itemCode",
      ...PLAIN,
      header: t("columns.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("columns.name") },
    {
      key: "perPanelQuantity",
      ...PLAIN,
      header: t("columns.perPanel"),
      render: (_, row) => quantity(row.perPanelQuantity),
    },
  ];

  return (
    <>
      <DetailSection title={t("itemsTitle")}>
        <Table
          columns={columns}
          data={report.items}
          rowKey={(row) => String(row.itemId)}
        />
        {report.totals ? (
          <p className="mt-3 text-sm text-text-secondary">
            {t("totals", {
              estimated: formatCurrency(report.totals.estimatedCost),
              actual: formatCurrency(report.totals.actualCost),
              variance: formatCurrency(report.totals.costVariance),
            })}
          </p>
        ) : null}
      </DetailSection>

      <DetailSection title={t("overBom.title")}>
        {report.overBomIssues.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("overBom.none")}</p>
        ) : (
          <Table
            columns={overBomColumns}
            data={report.overBomIssues}
            rowKey={(row) =>
              `${row.issueCode}-${row.itemId}-${row.panelTag ?? "order"}-${row.quantity}-${row.reason}`
            }
          />
        )}
      </DetailSection>

      {report.unlinked.length > 0 ? (
        <DetailSection title={t("unlinkedTitle")}>
          <p
            role="alert"
            className="mb-3 rounded-md border border-warning-bg bg-warning-bg px-3 py-2 text-sm text-warning-text"
          >
            {t("unlinkedWarning", { count: report.unlinked.length })}
          </p>
          <Table
            columns={unlinkedColumns}
            data={report.unlinked}
            rowKey={(row) => String(row.bomLineId)}
          />
        </DetailSection>
      ) : null}
    </>
  );
}
