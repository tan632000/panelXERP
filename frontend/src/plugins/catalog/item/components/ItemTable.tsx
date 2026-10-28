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
import { formatNumber } from "@/kernel/core/lib/formatters";

import {
  ITEM_LIST_PREFERENCE_KEY,
  itemApiRoutes,
} from "@plugins/catalog/item/constants";
import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";

import type { Item } from "@plugins/catalog/item/types";

export interface ItemTableProps
  extends TableColumnFilterHostProps, TableSortHostProps {
  data: Item[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  /** Shown in the table selection bar while at least one row is ticked. */
  selectionActions?: React.ReactNode;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  emptyText?: string;
}

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary transition-colors hover:bg-surface-secondary";

export function ItemTable({
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
}: ItemTableProps) {
  const t = useTranslations("item");
  const tCommon = useTranslations("common");
  const { can } = useAuth();
  const canUpdate = can(ItemPermission.update);
  const canDelete = can(ItemPermission.delete);
  // The edit form also carries the warehouse settings, which have a scope of their own.
  const canEdit = canUpdate || can(ItemPermission.stockSettings);
  const canSeePrice = can(ItemPermission.referencePriceRead);
  const showActions = canEdit || canDelete;
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

    const baseColumns: Array<TableColumn<Item>> = [
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
            className="block truncate font-semibold text-text-primary"
            title={item.name}
          >
            {item.name}
          </span>
        ),
      },
      {
        key: "group",
        header: t("group"),
        filterLabel: (value) => t(`groups.${value}`),
        render: (_, item) => text(t(`groups.${item.group}`)),
      },
      { key: "brand", header: t("brand"), render: text },
      { key: "unit", header: t("unit"), render: text },
      {
        key: "barcode",
        header: t("barcode"),
        filterable: false,
        sortable: false,
        render: (_, item) => text(item.barcode),
      },
      {
        key: "defaultLocation",
        header: t("locationColumn"),
        filterable: false,
        sortable: false,
        render: (_, item) => text(item.defaultLocation?.code),
      },
      {
        key: "minStock",
        header: t("minStock"),
        filterable: false,
        sortable: false,
        render: (_, item) =>
          text(item.minStock == null ? null : formatNumber(item.minStock)),
      },
      ...(canSeePrice
        ? [
            {
              key: "referencePrice",
              header: t("referencePrice"),
              // Not a text column the API can enumerate or order by.
              filterable: false,
              sortable: false,
              render: (_: unknown, item: Item) =>
                text(
                  item.referencePrice == null
                    ? null
                    : formatNumber(item.referencePrice),
                ),
            },
          ]
        : []),
    ];

    if (!showActions) return baseColumns;

    return [
      ...baseColumns,
      {
        key: "actions",
        header: "",
        render: (_, item) => (
          <div className="flex gap-[3px]" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
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
  }, [
    canDelete,
    canEdit,
    canSeePrice,
    empty,
    onDelete,
    onEdit,
    showActions,
    t,
    tCommon,
  ]);

  return (
    <Table
      columns={columns}
      data={data}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      selectionActions={selectionActions}
      rowKey={(item) => String(item.id)}
      onRowClick={canEdit ? (item) => onEdit(item) : undefined}
      emptyText={emptyText}
      columnFilterEndpoint={itemApiRoutes.columnValues}
      columnPreferenceKey={ITEM_LIST_PREFERENCE_KEY}
      columnFilterParams={columnFilterParams}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
