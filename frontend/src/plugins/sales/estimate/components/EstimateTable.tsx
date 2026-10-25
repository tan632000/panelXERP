"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import {
  formatCurrency,
  formatIsoDateTime,
} from "@/kernel/core/lib/formatters";

import { EstimateStatusBadge } from "./EstimateStatusBadge";

import type { EstimateListItem } from "@plugins/sales/estimate/types";

export interface EstimateTableProps {
  data: EstimateListItem[];
  onOpen: (estimate: EstimateListItem) => void;
}

export function EstimateTable({ data, onOpen }: EstimateTableProps) {
  const t = useTranslations("estimate");
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
    const columns: Array<TableColumn<EstimateListItem>> = [
      {
        ...base,
        key: "code",
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, estimate) => (
          <span className="font-semibold text-text-primary">
            {estimate.code}
          </span>
        ),
      },
      {
        ...base,
        key: "request",
        header: t("request"),
        render: (_, estimate) =>
          text(
            estimate.request
              ? `${estimate.request.code} — ${estimate.request.title}`
              : null,
          ),
      },
      {
        ...base,
        key: "customer",
        header: t("customer"),
        render: (_, estimate) => text(estimate.request?.customerName),
      },
      {
        ...base,
        key: "status",
        header: t("status"),
        render: (_, estimate) => (
          <EstimateStatusBadge status={estimate.status} size="sm" />
        ),
      },
      {
        ...base,
        key: "latestRevision",
        header: t("revision"),
        render: (_, estimate) => `#${estimate.latestRevision}`,
      },
      {
        ...base,
        key: "total",
        header: t("total"),
        className: "text-right",
        render: (_, estimate) => (
          <span className="tabular-nums">{formatCurrency(estimate.total)}</span>
        ),
      },
      {
        ...base,
        key: "assignedEngineerName",
        header: t("assignedEngineer"),
        render: (_, estimate) => text(estimate.request?.assignedEngineerName),
      },
      {
        ...base,
        key: "updatedAt",
        header: t("updatedAt"),
        render: (_, estimate) =>
          text(estimate.updatedAt && formatIsoDateTime(estimate.updatedAt)),
      },
    ];
    return columns;
  }, [empty, t]);

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(estimate) => String(estimate.id)}
      onRowClick={onOpen}
    />
  );
}
