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
  PROJECT_LIST_PREFERENCE_KEY,
  projectApiRoutes,
} from "@plugins/crm/project/constants";
import { ProjectPermission } from "@plugins/crm/project/permissions/project-permission.keys";

import type { Project } from "@plugins/crm/project/types";

export interface ProjectTableProps
  extends TableColumnFilterHostProps, TableSortHostProps {
  data: Project[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  /** Shown in the table selection bar while at least one row is ticked. */
  selectionActions?: React.ReactNode;
  onEdit: (item: Project) => void;
  onDelete: (item: Project) => void;
  emptyText?: string;
}

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary transition-colors hover:bg-surface-secondary";

export function ProjectTable({
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
}: ProjectTableProps) {
  const t = useTranslations("project");
  const tCommon = useTranslations("common");
  const { can } = useAuth();
  const canUpdate = can(ProjectPermission.update);
  const canDelete = can(ProjectPermission.delete);
  const showActions = canUpdate || canDelete;
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

    const baseColumns: Array<TableColumn<Project>> = [
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
        key: "customerName",
        header: t("customer"),
        render: (_, item) =>
          text(
            [item.customerCode, item.customerName].filter(Boolean).join(" — "),
          ),
      },
      { key: "siteAddress", header: t("siteAddress"), render: text },
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
      onRowClick={canUpdate ? (item) => onEdit(item) : undefined}
      emptyText={emptyText}
      columnFilterEndpoint={projectApiRoutes.columnValues}
      columnPreferenceKey={PROJECT_LIST_PREFERENCE_KEY}
      columnFilterParams={columnFilterParams}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
