"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import type { ReceiptRow } from "@plugins/inventory/receipt/types";

/** The API neither filters nor sorts by column: every one is plain display. */
const PLAIN = { filterable: false, sortable: false } as const;

export function ReceiptTable({
  data,
  onOpenOrder,
}: {
  data: ReceiptRow[];
  onOpenOrder: (row: ReceiptRow) => void;
}) {
  const t = useTranslations("receipt");
  const columns: Array<TableColumn<ReceiptRow>> = [
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
      key: "purchaseOrderCode",
      ...PLAIN,
      header: t("purchaseOrder"),
      render: (_, row) => (
        <span className="font-mono">{row.purchaseOrderCode}</span>
      ),
    },
    { key: "supplierName", ...PLAIN, header: t("supplier") },
    { key: "lineCount", ...PLAIN, header: t("lineCount") },
    {
      key: "createdByName",
      ...PLAIN,
      header: t("createdBy"),
      render: (_, row) => row.createdByName ?? t("emptyValue"),
    },
    {
      key: "createdAt",
      ...PLAIN,
      header: t("createdAt"),
      render: (_, row) => formatIsoDateTime(row.createdAt),
    },
  ];

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(row) => String(row.id)}
      onRowClick={onOpenOrder}
    />
  );
}
