"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatNumber } from "@/kernel/core/lib/formatters";

import { useProductionShortage } from "@plugins/production/production-order/hooks/api/useProductionOrder";

import type { ProductionShortItem } from "@plugins/production/production-order/types";

const PLAIN = { filterable: false, sortable: false } as const;
const QUANTITY = { maximumFractionDigits: 3 };

const quantity = (value: number, testId?: string) => (
  <span className="tabular-nums" data-testid={testId}>
    {formatNumber(value, QUANTITY)}
  </span>
);

/**
 * The items the order's materials still lack, as the material view computes them. It only
 * informs: nothing in production waits on stock.
 */
export function ProductionShortagePanel({ id }: Readonly<{ id: number }>) {
  const t = useTranslations("production");
  const query = useProductionShortage(id);

  const columns: Array<TableColumn<ProductionShortItem>> = [
    {
      key: "itemCode",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("shortage.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("shortage.name") },
    { key: "itemUnit", ...PLAIN, header: t("shortage.unit") },
    {
      key: "demand",
      ...PLAIN,
      header: t("shortage.demand"),
      render: (_, row) => quantity(row.demand),
    },
    {
      key: "reserved",
      ...PLAIN,
      header: t("shortage.reserved"),
      render: (_, row) => quantity(row.reserved),
    },
    {
      key: "short",
      ...PLAIN,
      header: t("shortage.short"),
      render: (_, row) => quantity(row.short, `short-${row.itemId}`),
    },
  ];

  let body: React.ReactNode = null;
  if (query.isError) {
    body = (
      <EmptyState
        bordered={false}
        icon="package-export"
        message={t("shortage.loadError")}
      />
    );
  } else if (query.data) {
    body =
      query.data.length === 0 ? (
        <EmptyState
          bordered={false}
          icon="package-export"
          message={t("shortage.none")}
        />
      ) : (
        <Table
          columns={columns}
          data={query.data}
          rowKey={(row) => String(row.itemId)}
        />
      );
  }
  if (!body) return null;

  return <DetailSection title={t("shortage.title")}>{body}</DetailSection>;
}
