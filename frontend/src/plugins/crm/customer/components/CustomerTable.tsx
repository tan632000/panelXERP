"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  Table,
  type TableColumn,
  type TableColumnFilterHostProps,
  type TableSortHostProps,
} from "@/kernel/core/components/ui/Table";

import {
  CUSTOMER_LIST_PREFERENCE_KEY,
  customerApiRoutes,
} from "@plugins/crm/customer/constants";
import { CustomerPermission } from "@plugins/crm/customer/permissions/customer-permission.keys";

import type { Customer } from "@plugins/crm/customer/types";

export interface CustomerTableProps
  extends TableColumnFilterHostProps, TableSortHostProps {
  data: Customer[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  /** Shown in the table selection bar while at least one row is ticked. */
  selectionActions?: React.ReactNode;
  onRowClick: (item: Customer) => void;
  onEdit: (item: Customer) => void;
  onDelete: (item: Customer) => void;
  emptyText?: string;
}

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary transition-colors hover:bg-surface-secondary";

export function CustomerTable({
  data,
  selectedKeys,
  onSelectionChange,
  selectionActions,
  onRowClick,
  onEdit,
  onDelete,
  emptyText,
  columnFilterParams,
  columnFilters,
  onColumnFiltersChange,
  sort,
  onSortChange,
}: CustomerTableProps) {
  const t = useTranslations("customer");
  const tCommon = useTranslations("common");
  const { can } = useAuth();
  const canUpdate = can(CustomerPermission.update);
  const canDelete = can(CustomerPermission.delete);
  const showActions = canUpdate || canDelete;
  const empty = t("emptyValue");

  const columns = useMemo(() => {
    const text = (value?: string | null) => (
      <span
        className="text-text-secondary truncate block"
        title={value ?? undefined}
      >
        {value || empty}
      </span>
    );

    const baseColumns: Array<TableColumn<Customer>> = [
      {
        key: "code",
        mobile: { role: "title", record: true },
        header: t("code"),
        render: (_, item) => (
          <span className="font-semibold text-text-primary">{item.code}</span>
        ),
      },
      {
        key: "name",
        header: t("name"),
        render: (_, item) => (
          <span
            className="font-semibold text-text-primary truncate block"
            title={item.name}
          >
            {item.name}
          </span>
        ),
      },
      { key: "taxCode", header: t("taxCode"), render: text },
      { key: "phone", header: t("phone"), render: text },
      { key: "email", header: t("email"), render: text },
      {
        // The owner is shown by name, which the API cannot filter or sort by.
        key: "salesOwnerName",
        header: t("salesOwner"),
        filterable: false,
        sortable: false,
        render: text,
      },
    ];

    if (!showActions) return baseColumns;

    return [
      ...baseColumns,
      {
        key: "actions",
        header: "",
        render: (_, item) => (
          <div className="flex gap-[3px]" onClick={(e) => e.stopPropagation()}>
            {canUpdate && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-text-secondary hover:text-text-primary`}
                onClick={() => onEdit(item)}
                title={tCommon("edit")}
              >
                <Icon name="edit" size={15} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-danger-text hover:text-danger-text`}
                onClick={() => onDelete(item)}
                title={tCommon("delete")}
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [canDelete, canUpdate, empty, onDelete, onEdit, showActions, t, tCommon]);

  return (
    <Table
      columns={columns}
      data={data}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      selectionActions={selectionActions}
      rowKey={(item) => String(item.id)}
      onRowClick={(item) => onRowClick(item)}
      emptyText={emptyText}
      columnFilterEndpoint={customerApiRoutes.columnValues}
      columnPreferenceKey={CUSTOMER_LIST_PREFERENCE_KEY}
      columnFilterParams={columnFilterParams}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
