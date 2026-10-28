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
  LOCATION_LIST_PREFERENCE_KEY,
  locationApiRoutes,
} from "@plugins/catalog/location/constants";
import { LocationPermission } from "@plugins/catalog/location/permissions/location-permission.keys";

import type { Location } from "@plugins/catalog/location/types";

export interface LocationTableProps
  extends TableColumnFilterHostProps, TableSortHostProps {
  data: Location[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  /** Shown in the table selection bar while at least one row is ticked. */
  selectionActions?: React.ReactNode;
  onEdit: (item: Location) => void;
  onDelete: (item: Location) => void;
  emptyText?: string;
}

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary transition-colors hover:bg-surface-secondary";

export function LocationTable({
  data,
  selectedKeys,
  onSelectionChange,
  selectionActions,
  onEdit,
  onDelete,
  emptyText,
  columnFilterParams,
  columnFilters,
  onColumnFiltersChange,
  sort,
  onSortChange,
}: LocationTableProps) {
  const t = useTranslations("location");
  const tCommon = useTranslations("common");
  const { can } = useAuth();
  const canUpdate = can(LocationPermission.update);
  const canDelete = can(LocationPermission.delete);
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

    const baseColumns: Array<TableColumn<Location>> = [
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
      {
        // The flag is shown as a label, which the API cannot filter or sort by.
        key: "isActive",
        header: t("status"),
        filterable: false,
        sortable: false,
        render: (_, item) =>
          text(item.isActive ? t("statusActive") : t("statusInactive")),
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
      emptyText={emptyText}
      columnFilterEndpoint={locationApiRoutes.columnValues}
      columnPreferenceKey={LOCATION_LIST_PREFERENCE_KEY}
      columnFilterParams={columnFilterParams}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
