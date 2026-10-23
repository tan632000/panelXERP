"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useMemo, useState } from "react";

import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { useTableColumnFilters } from "@/kernel/core/hooks/useTableColumnFilters";
import { useTableSort } from "@/kernel/core/hooks/useTableSort";
import { resolveListEmptyMessage } from "@/kernel/core/lib/list-params";
import { includesFolded } from "@/kernel/core/lib/search-text";

import {
  ROLE_LIST_PREFERENCE_KEY,
  WILDCARD_PERMISSION,
} from "@plugins/system/roles/constants";
import { useSystemRoleList } from "@plugins/system/roles/hooks/api/useSystemRoles";
import { useRoleLabels } from "@plugins/system/roles/hooks/useRoleLabels";

import { RolePermissionModal } from "./RolePermissionModal";

import type { SystemRole } from "@plugins/system/roles/types";

export function RoleListPage() {
  const t = useTranslations("system.roles");
  const tCommon = useTranslations("common");
  const { data, isLoading, isError } = useSystemRoleList();
  // An empty body answers `null`, which a default parameter would not catch.
  const roles = useMemo(() => data ?? [], [data]);
  const { labelOfCode } = useRoleLabels();
  const [search, setSearch] = useListViewState("search", "");
  const [target, setTarget] = useState<SystemRole | null>(null);
  const columnFilters = useTableColumnFilters({ persistKey: "columnFilters" });
  const sorting = useTableSort({ persistKey: "sort" });

  useQueryErrorToast(isError, t("toast.systemError"));

  /** What a cell reads, which is also what its column filter must offer and sort by. */
  const columnValueOf = useCallback(
    (role: SystemRole, columnKey: string): string => {
      switch (columnKey) {
        case "name":
          return labelOfCode(role.code, role.name);
        case "code":
          return role.code;
        case "userCount":
          return String(role.userCount);
        case "permissions":
          return role.permissions.includes(WILDCARD_PERMISSION)
            ? t("allPermissions")
            : String(role.permissions.length);
        default:
          return "";
      }
    },
    [t, labelOfCode],
  );

  const searched = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return roles;
    return roles.filter(
      (role) =>
        includesFolded(labelOfCode(role.code, role.name), keyword) ||
        includesFolded(role.name, keyword) ||
        includesFolded(role.code, keyword),
    );
  }, [roles, search, labelOfCode]);

  const selections = columnFilters.tableProps.columnFilters;

  /** Roles the keyword and every column selection except `exceptKey`'s own leave. */
  const rolesLeftBy = useCallback(
    (exceptKey?: string) =>
      searched.filter((role) =>
        Object.entries(selections).every(
          ([columnKey, values]) =>
            columnKey === exceptKey ||
            !values?.length ||
            values.includes(columnValueOf(role, columnKey)),
        ),
      ),
    [searched, selections, columnValueOf],
  );

  // The whole catalog is already in the browser, so the column filters and the sort are
  // applied here rather than through a query the way a paged list does it.
  const items = useMemo(() => {
    const filtered = rolesLeftBy();

    const sort = sorting.sort;
    if (!sort) return filtered;

    const numeric = sort.key === "userCount" || sort.key === "permissions";
    const factor = sort.direction === "DESC" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const left = columnValueOf(a, sort.key);
      const right = columnValueOf(b, sort.key);
      if (numeric) {
        return (Number(left) - Number(right) || 0) * factor;
      }
      return left.localeCompare(right) * factor;
    });
  }, [rolesLeftBy, sorting.sort, columnValueOf]);

  // A column offers the values of the rows on screen; its own selection does not narrow it.
  const localColumnValues = useCallback(
    (columnKey: string) => [
      ...new Set(
        rolesLeftBy(columnKey).map((role) => columnValueOf(role, columnKey)),
      ),
    ],
    [rolesLeftBy, columnValueOf],
  );

  const columns = useMemo<Array<TableColumn<SystemRole>>>(
    () => [
      {
        key: "name",
        mobile: { role: "title", record: true },
        header: t("name"),
        render: (_, role) => (
          <span className="font-semibold text-text-primary">
            {labelOfCode(role.code, role.name)}
          </span>
        ),
      },
      {
        key: "code",
        header: t("code"),
        render: (_, role) => (
          <span className="font-mono text-text-secondary">{role.code}</span>
        ),
      },
      {
        key: "userCount",
        mobile: { role: "metric" },
        header: t("userCount"),
        className: "w-[120px]",
      },
      {
        key: "permissions",
        mobile: { role: "metric", emphasis: true },
        header: t("permissionCount"),
        className: "w-[160px]",
        render: (_, role) =>
          role.permissions.includes(WILDCARD_PERMISSION)
            ? t("allPermissions")
            : role.permissions.length,
      },
      {
        key: "actions",
        header: tCommon("tableColumns.actionsColumn"),
        filterable: false,
        sortable: false,
        className: "w-[160px]",
        render: (_, role) =>
          role.permissions.includes(WILDCARD_PERMISSION) ? (
            <span className="text-xs text-text-tertiary">
              {t("wildcardLocked")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setTarget(role)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-secondary bg-surface-primary px-2.5 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary"
            >
              <Icon name="shield-check" size={14} />
              {t("assign")}
            </button>
          ),
      },
    ],
    [t, tCommon, labelOfCode],
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <ListPageLayout>
        <ListToolbar>
          <SearchInput
            placeholder={t("searchPlaceholder")}
            value={search}
            onChangeValue={setSearch}
          />
        </ListToolbar>

        <ListQueryBody
          isLoading={isLoading}
          isEmpty={items.length === 0}
          emptyState={
            <EmptyState
              icon="shield-check"
              message={resolveListEmptyMessage(
                Boolean(search.trim()) || columnFilters.activeCount > 0,
                {
                  empty: t("noItems"),
                  notFound: t("noItemsFound"),
                },
              )}
            />
          }
          pagination={{
            // Seventeen roles is the whole catalog; the list is never paged.
            currentPage: 1,
            totalPages: 1,
            totalItems: items.length,
            startIndex: items.length === 0 ? 0 : 1,
            endIndex: items.length,
            onPageChange: () => {},
            itemLabel: t("paginationItem"),
          }}
        >
          <TableMobileCards>
            <Table
              columns={columns}
              data={items}
              rowKey={(role) => String(role.id)}
              localColumnValues={localColumnValues}
              columnPreferenceKey={ROLE_LIST_PREFERENCE_KEY}
              {...columnFilters.tableProps}
              {...sorting.tableProps}
            />
          </TableMobileCards>
        </ListQueryBody>
      </ListPageLayout>

      {target && (
        <RolePermissionModal
          isOpen={Boolean(target)}
          onClose={() => setTarget(null)}
          role={target}
          roleLabel={labelOfCode(target.code, target.name)}
        />
      )}
    </>
  );
}

export default RoleListPage;
