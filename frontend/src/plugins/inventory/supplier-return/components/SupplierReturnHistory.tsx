"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import { useSupplierReturns } from "@plugins/inventory/supplier-return/hooks/api/useSupplierReturn";

import type { SupplierReturnRow } from "@plugins/inventory/supplier-return/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** The returns of one purchase order, on its detail page; nothing while there are none. */
export function SupplierReturnHistory({
  purchaseOrderId,
}: {
  purchaseOrderId: number;
}) {
  const t = useTranslations("supplierReturn");
  const { data } = useSupplierReturns(purchaseOrderId);
  const rows = data?.data ?? [];
  if (rows.length === 0) return null;

  const columns: Array<TableColumn<SupplierReturnRow>> = [
    {
      key: "code",
      ...PLAIN,
      header: t("history.code"),
      render: (_, row) => <span className="font-mono">{row.code}</span>,
    },
    { key: "reason", ...PLAIN, header: t("reason") },
    { key: "lineCount", ...PLAIN, header: t("history.lineCount") },
    {
      key: "createdByName",
      ...PLAIN,
      header: t("history.createdBy"),
      render: (_, row) => row.createdByName ?? "—",
    },
    {
      key: "createdAt",
      ...PLAIN,
      header: t("history.createdAt"),
      render: (_, row) => formatIsoDateTime(row.createdAt),
    },
  ];

  return (
    <DetailSection title={t("history.title")}>
      <Table columns={columns} data={rows} rowKey={(row) => String(row.id)} />
    </DetailSection>
  );
}
