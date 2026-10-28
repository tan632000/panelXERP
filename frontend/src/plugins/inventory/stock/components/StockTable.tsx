"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import type { StockRow } from "@plugins/inventory/stock/types";

export interface StockTableProps {
  data: StockRow[];
  /** Opens the item's ledger; absent when the actor may not read it. */
  onOpenLedger?: (row: StockRow) => void;
  /** The API sends cost keys only to actors holding `purchase_price:read`. */
  showCosts: boolean;
}

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary";

/** The API neither filters nor sorts the stock columns: every one is plain display. */
const PLAIN = { filterable: false, sortable: false } as const;

export function StockTable({ data, onOpenLedger, showCosts }: StockTableProps) {
  const t = useTranslations("stock");

  const columns = useMemo(() => {
    const quantity = (value?: number | null) => (
      <span className="tabular-nums">{formatNumber(value)}</span>
    );

    const result: Array<TableColumn<StockRow>> = [
      {
        key: "code",
        ...PLAIN,
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, row) => (
          <span className="font-semibold text-text-primary">{row.code}</span>
        ),
      },
      {
        key: "name",
        ...PLAIN,
        header: t("name"),
        render: (_, row) => (
          <span className="truncate block" title={row.name}>
            {row.name}
          </span>
        ),
      },
      { key: "unit", ...PLAIN, header: t("unit") },
      {
        key: "locationCode",
        ...PLAIN,
        header: t("location"),
        render: (_, row) => row.locationCode ?? t("emptyValue"),
      },
      {
        key: "onHand",
        ...PLAIN,
        header: t("onHand"),
        render: (_, row) => quantity(row.onHand),
      },
      {
        key: "reserved",
        ...PLAIN,
        header: t("reserved"),
        render: (_, row) => quantity(row.reserved),
      },
      {
        key: "available",
        ...PLAIN,
        header: t("available"),
        render: (_, row) => (
          <span
            className={
              row.low
                ? "font-semibold text-danger-text tabular-nums"
                : "tabular-nums"
            }
          >
            {formatNumber(row.available)}
            {row.low && <span className="ml-1.5">{t("lowBadge")}</span>}
          </span>
        ),
      },
      {
        key: "minStock",
        ...PLAIN,
        header: t("minStock"),
        render: (_, row) => quantity(row.minStock),
      },
    ];

    if (showCosts) {
      result.push(
        {
          key: "avgCost",
          ...PLAIN,
          header: t("avgCost"),
          render: (_, row) => formatCurrency(row.avgCost),
        },
        {
          key: "value",
          ...PLAIN,
          header: t("value"),
          render: (_, row) => formatCurrency(row.value),
        },
      );
    }

    if (onOpenLedger) {
      result.push({
        key: "actions",
        header: "",
        render: (_, row) => (
          <button
            type="button"
            className={ACTION_BUTTON}
            onClick={(event) => {
              event.stopPropagation();
              onOpenLedger(row);
            }}
            title={t("openLedger")}
            aria-label={t("openLedger")}
          >
            <Icon name="list" size={15} />
          </button>
        ),
      });
    }
    return result;
  }, [onOpenLedger, showCosts, t]);

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(row) => String(row.itemId)}
      onRowClick={onOpenLedger}
    />
  );
}
