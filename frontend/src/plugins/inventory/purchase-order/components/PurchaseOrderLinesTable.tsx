"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import type { PurchaseOrderLine } from "@plugins/inventory/purchase-order/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** The ordered lines, read-only; prices only when the API sent them. */
export function PurchaseOrderLinesTable({
  lines,
  showCosts,
}: {
  lines: PurchaseOrderLine[];
  showCosts: boolean;
}) {
  const t = useTranslations("purchaseOrder");
  const quantity = (value: number) => (
    <span className="tabular-nums">
      {formatNumber(value, { maximumFractionDigits: 3 })}
    </span>
  );

  const columns: Array<TableColumn<PurchaseOrderLine>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    { key: "itemUnit", ...PLAIN, header: t("lines.unit") },
    {
      key: "quantity",
      ...PLAIN,
      header: t("lines.quantity"),
      render: (_, row) => quantity(row.quantity),
    },
    {
      key: "receivedQty",
      ...PLAIN,
      header: t("lines.received"),
      render: (_, row) => quantity(row.receivedQty),
    },
    ...(showCosts
      ? ([
          {
            key: "unitPrice",
            ...PLAIN,
            header: t("lines.unitPrice"),
            render: (_, row) => formatCurrency(row.unitPrice),
          },
          {
            key: "amount",
            ...PLAIN,
            header: t("lines.amount"),
            render: (_, row) => formatCurrency(row.amount),
          },
        ] satisfies Array<TableColumn<PurchaseOrderLine>>)
      : []),
  ];

  return (
    <Table columns={columns} data={lines} rowKey={(row) => String(row.id)} />
  );
}
