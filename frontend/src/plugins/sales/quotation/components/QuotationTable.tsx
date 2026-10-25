"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import {
  formatCurrency,
  formatIsoDateTime,
} from "@/kernel/core/lib/formatters";

import { QuotationStatusBadge } from "./QuotationStatusBadge";

import type { QuotationListItem } from "@plugins/sales/quotation/types";

export interface QuotationTableProps {
  data: QuotationListItem[];
  onOpen: (quotation: QuotationListItem) => void;
}

export function QuotationTable({ data, onOpen }: QuotationTableProps) {
  const t = useTranslations("quotation");
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
    const columns: Array<TableColumn<QuotationListItem>> = [
      {
        ...base,
        key: "code",
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, quotation) => (
          <span className="font-semibold text-text-primary">
            {quotation.code}
          </span>
        ),
      },
      {
        ...base,
        key: "request",
        header: t("request"),
        render: (_, quotation) =>
          text(
            quotation.request
              ? `${quotation.request.code} — ${quotation.request.title}`
              : null,
          ),
      },
      {
        ...base,
        key: "customer",
        header: t("customer"),
        render: (_, quotation) => text(quotation.request?.customerName),
      },
      {
        ...base,
        key: "status",
        header: t("status"),
        render: (_, quotation) =>
          quotation.latest ? (
            <QuotationStatusBadge status={quotation.latest.status} size="sm" />
          ) : (
            empty
          ),
      },
      {
        ...base,
        key: "latestVer",
        header: t("version"),
        render: (_, quotation) => `v${quotation.latestVer}`,
      },
      {
        ...base,
        key: "total",
        header: t("total"),
        className: "text-right",
        render: (_, quotation) => (
          <span className="tabular-nums">
            {formatCurrency(quotation.latest?.total)}
          </span>
        ),
      },
      {
        ...base,
        key: "salesOwnerName",
        header: t("salesOwner"),
        render: (_, quotation) => text(quotation.request?.salesOwnerName),
      },
      {
        ...base,
        key: "updatedAt",
        header: t("updatedAt"),
        render: (_, quotation) =>
          text(quotation.updatedAt && formatIsoDateTime(quotation.updatedAt)),
      },
    ];
    return columns;
  }, [empty, t]);

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(quotation) => String(quotation.id)}
      onRowClick={onOpen}
    />
  );
}
