"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatCurrency, formatIsoDate } from "@/kernel/core/lib/formatters";

import { PurchaseOrderStatusBadge } from "./PurchaseOrderStatusBadge";

import type { PurchaseOrderRow } from "@plugins/inventory/purchase-order/types";

export interface PurchaseOrderTableProps {
  data: PurchaseOrderRow[];
  onOpen: (row: PurchaseOrderRow) => void;
  /** The API sends money keys only to actors holding `purchase_price:read`. */
  showCosts: boolean;
}

/** The API neither filters nor sorts by column: every one is plain display. */
const PLAIN = { filterable: false, sortable: false } as const;

export function PurchaseOrderTable({
  data,
  onOpen,
  showCosts,
}: PurchaseOrderTableProps) {
  const t = useTranslations("purchaseOrder");

  const columns = useMemo(() => {
    const result: Array<TableColumn<PurchaseOrderRow>> = [
      {
        key: "code",
        ...PLAIN,
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, row) => (
          <span className="font-mono font-semibold text-text-primary">
            {row.code}
          </span>
        ),
      },
      {
        key: "supplierName",
        ...PLAIN,
        header: t("supplier"),
        render: (_, row) => `${row.supplierCode} — ${row.supplierName}`,
      },
      {
        key: "status",
        ...PLAIN,
        header: t("status"),
        render: (_, row) => <PurchaseOrderStatusBadge status={row.status} />,
      },
      {
        key: "expectedDate",
        ...PLAIN,
        header: t("expectedDate"),
        render: (_, row) =>
          row.expectedDate ? formatIsoDate(row.expectedDate) : t("emptyValue"),
      },
    ];
    if (showCosts) {
      result.push({
        key: "total",
        ...PLAIN,
        header: t("total"),
        render: (_, row) => (
          <span className="tabular-nums">{formatCurrency(row.total)}</span>
        ),
      });
    }
    result.push({
      key: "createdByName",
      ...PLAIN,
      header: t("createdBy"),
      render: (_, row) => row.createdByName ?? t("emptyValue"),
    });
    return result;
  }, [showCosts, t]);

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(row) => String(row.id)}
      onRowClick={onOpen}
    />
  );
}
