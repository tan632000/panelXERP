"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import {
  Table,
  type TableColumn,
  type TableColumnFilterHostProps,
  type TableSortHostProps,
} from "@/kernel/core/components/ui/Table";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

import {
  REQUEST_LIST_PREFERENCE_KEY,
  requestApiRoutes,
} from "@plugins/sales/request/constants";

import { RequestStatusBadge } from "./RequestStatusBadge";

import type { RequestListItem } from "@plugins/sales/request/types";

export interface RequestTableProps
  extends TableColumnFilterHostProps, TableSortHostProps {
  data: RequestListItem[];
  onOpen: (request: RequestListItem) => void;
  emptyText?: string;
}

export function RequestTable({
  data,
  onOpen,
  emptyText,
  columnFilterParams,
  columnFilters,
  onColumnFiltersChange,
  sort,
  onSortChange,
}: RequestTableProps) {
  const t = useTranslations("request");
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

    const columns: Array<TableColumn<RequestListItem>> = [
      {
        key: "code",
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, request) => (
          <span className="font-semibold text-text-primary">
            {request.code}
          </span>
        ),
      },
      {
        key: "title",
        header: t("titleField"),
        render: (_, request) => (
          <span
            className="block truncate font-semibold text-text-primary"
            title={request.title}
          >
            {request.title}
          </span>
        ),
      },
      {
        key: "customer",
        header: t("customer"),
        // The customer is another table's column: not enumerable or sortable here.
        filterable: false,
        sortable: false,
        render: (_, request) =>
          text(
            [request.customerCode, request.customerName]
              .filter(Boolean)
              .join(" — "),
          ),
      },
      {
        key: "status",
        header: t("status"),
        filterLabel: (value) => t(`statuses.${value}`),
        render: (_, request) => (
          <RequestStatusBadge status={request.status} size="sm" />
        ),
      },
      {
        key: "assignedEngineerName",
        header: t("assignedEngineer"),
        filterable: false,
        sortable: false,
        render: (_, request) => text(request.assignedEngineerName),
      },
      {
        key: "quotationDueDate",
        header: t("quotationDueDate"),
        filterable: false,
        sortable: false,
        render: (_, request) =>
          text(
            request.quotationDueDate && formatIsoDate(request.quotationDueDate),
          ),
      },
      {
        key: "salesOwnerName",
        header: t("salesOwner"),
        filterable: false,
        sortable: false,
        render: (_, request) => text(request.salesOwnerName),
      },
    ];
    return columns;
  }, [empty, t]);

  return (
    <Table
      columns={columns}
      data={data}
      rowKey={(request) => String(request.id)}
      onRowClick={onOpen}
      emptyText={emptyText}
      columnFilterEndpoint={requestApiRoutes.columnValues}
      columnPreferenceKey={REQUEST_LIST_PREFERENCE_KEY}
      columnFilterParams={columnFilterParams}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
