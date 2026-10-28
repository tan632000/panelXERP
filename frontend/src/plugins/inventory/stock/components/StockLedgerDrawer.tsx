"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { DetailPanel } from "@/kernel/core/components/ui/DetailPanel";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import {
  formatCurrency,
  formatIsoDateTime,
  formatNumber,
} from "@/kernel/core/lib/formatters";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";

import { STOCK_LEDGER_PAGE_SIZE } from "@plugins/inventory/stock/constants";
import { useStockMovements } from "@plugins/inventory/stock/hooks/api/useStock";

import type { StockMovement, StockRow } from "@plugins/inventory/stock/types";

export interface StockLedgerDrawerProps {
  item: StockRow;
  showCosts: boolean;
  onClose: () => void;
}

/** Columns of a read-only ledger: neither filtered nor sorted. */
const PLAIN = { filterable: false, sortable: false } as const;

/** The movements of one item, newest first. */
export function StockLedgerDrawer({
  item,
  showCosts,
  onClose,
}: StockLedgerDrawerProps) {
  const t = useTranslations("stock");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStockMovements(item.itemId, page);
  const rows = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page,
      pageSize: STOCK_LEDGER_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: rows.length,
    });

  const costColumns: Array<TableColumn<StockMovement>> = showCosts
    ? [
        {
          key: "unitCost",
          ...PLAIN,
          header: t("ledger.unitCost"),
          render: (_, row) => formatCurrency(row.unitCost),
        },
        {
          key: "value",
          ...PLAIN,
          header: t("ledger.value"),
          render: (_, row) => formatCurrency(row.value),
        },
      ]
    : [];

  const columns: Array<TableColumn<StockMovement>> = [
    {
      key: "createdAt",
      ...PLAIN,
      header: t("ledger.date"),
      render: (_, row) => formatIsoDateTime(row.createdAt),
    },
    {
      key: "movementType",
      ...PLAIN,
      header: t("ledger.type"),
      render: (_, row) => t(`movementType.${row.movementType}`),
    },
    {
      key: "quantity",
      ...PLAIN,
      header: t("ledger.quantity"),
      render: (_, row) => (
        <span className="tabular-nums">
          {row.quantity > 0 ? "+" : ""}
          {formatNumber(row.quantity)}
        </span>
      ),
    },
    {
      key: "onHandAfter",
      ...PLAIN,
      header: t("ledger.onHandAfter"),
      render: (_, row) => formatNumber(row.onHandAfter),
    },
    ...costColumns,
    {
      key: "createdByName",
      ...PLAIN,
      header: t("ledger.createdBy"),
      render: (_, row) => row.createdByName ?? t("emptyValue"),
    },
  ];

  return (
    <DetailPanel
      open
      wide
      title={t("ledger.title", { code: item.code })}
      subtitle={item.name}
      onClose={onClose}
    >
      <ListQueryBody
        isLoading={isLoading}
        isEmpty={rows.length === 0}
        emptyState={
          <p className="px-4 py-6 text-text-secondary">{t("ledger.empty")}</p>
        }
        pagination={{
          currentPage: page,
          totalPages,
          totalItems,
          startIndex,
          endIndex,
          onPageChange: setPage,
          itemLabel: t("ledger.paginationItem"),
        }}
      >
        <Table columns={columns} data={rows} rowKey={(row) => row.id} />
      </ListQueryBody>
    </DetailPanel>
  );
}
