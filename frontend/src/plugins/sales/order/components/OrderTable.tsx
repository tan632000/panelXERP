"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { formatCurrency, formatIsoDate } from "@/kernel/core/lib/formatters";

import { OrderStatusBadge } from "./OrderStatusBadge";

import type { OrderListItem } from "@plugins/sales/order/types";

export interface OrderTableProps {
  data: OrderListItem[];
  onOpen: (order: OrderListItem) => void;
}

export function OrderTable({ data, onOpen }: OrderTableProps) {
  const t = useTranslations("order");
  const empty = t("emptyValue");

  const columns = useMemo(() => {
    const text = (value?: string | null) => (
      <span
        className="block truncate text-text-secondary"
        title={value ?? undefined}
      >
        {value || empty}
      </span>
    );

    // Every value is another table's or computed, so no column filters or sorts here.
    const base = { filterable: false, sortable: false } as const;
    const columns: Array<TableColumn<OrderListItem>> = [
      {
        ...base,
        key: "code",
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, order) => (
          <span className="font-semibold text-text-primary">{order.code}</span>
        ),
      },
      {
        ...base,
        key: "customerName",
        header: t("customer"),
        render: (_, order) => text(order.customerName),
      },
      {
        ...base,
        key: "request",
        header: t("request"),
        render: (_, order) => text(order.request?.code),
      },
      {
        ...base,
        key: "contractNo",
        header: t("contractNo"),
        render: (_, order) => text(order.contractNo),
      },
      {
        ...base,
        key: "deliveryDate",
        header: t("deliveryDate"),
        render: (_, order) =>
          text(order.deliveryDate && formatIsoDate(order.deliveryDate)),
      },
      {
        ...base,
        key: "status",
        header: t("status"),
        render: (_, order) => (
          <OrderStatusBadge status={order.status} size="sm" />
        ),
      },
      {
        ...base,
        key: "total",
        header: t("total"),
        className: "text-right",
        render: (_, order) => (
          <span className="tabular-nums">{formatCurrency(order.total)}</span>
        ),
      },
    ];
    return columns;
  }, [empty, t]);

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(order) => String(order.id)}
      onRowClick={onOpen}
    />
  );
}
