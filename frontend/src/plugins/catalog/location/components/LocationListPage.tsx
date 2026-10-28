"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { BulkDeleteAction } from "@/kernel/core/components/ui/BulkDeleteAction";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { PageToolbarActions } from "@/kernel/core/components/ui/PageToolbarActions";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useBulkSelection } from "@/kernel/core/hooks/useBulkSelection";
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useDeleteConfirmation } from "@/kernel/core/hooks/useDeleteConfirmation";
import { useDeleteFailureReason } from "@/kernel/core/hooks/useDeleteFailureReason";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { useRowLabels } from "@/kernel/core/hooks/useRowLabels";
import { useTableColumnFilters } from "@/kernel/core/hooks/useTableColumnFilters";
import { useTableSort } from "@/kernel/core/hooks/useTableSort";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { columnFilterScope } from "@/kernel/core/lib/table-column-filter";
import { PermissionGate } from "@/kernel/core/permissions/PermissionGate";

import {
  useBulkDeleteLocations,
  useDeleteLocation,
  useLocationList,
} from "@plugins/catalog/location/hooks/api/useLocation";
import { locationFeature } from "@plugins/catalog/location/location.feature";
import { LocationPermission } from "@plugins/catalog/location/permissions/location-permission.keys";
import { LOCATION_DELETE } from "@plugins/catalog/location/permissions/location.permissions";
import { resolveLocationDeleteToastKey } from "@plugins/catalog/location/utils/map-location-api-errors";

import { LocationFormModal } from "./LocationFormModal";
import { LocationTable } from "./LocationTable";

import type { Location } from "@plugins/catalog/location/types";

export function LocationListPage() {
  const t = useTranslations("location");
  const tCommon = useTranslations("common");
  const tToast = useTranslations("location.toast");
  const { can } = useAuth();
  const canCreate = can(LocationPermission.create);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null);

  const columnFilters = useTableColumnFilters({
    persistKey: "columnFilters",
    onChange: () => setCurrentPage(1),
  });
  const sorting = useTableSort({
    persistKey: "sort",
    onChange: () => setCurrentPage(1),
  });

  const params = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      columnFilters: columnFilters.param,
      ...sorting.params,
    }),
    [currentPage, committedSearch, columnFilters.param, sorting.params],
  );

  const selection = useBulkSelection();

  const { data: listData, isLoading, isError } = useLocationList(params);
  const deleteLocation = useDeleteLocation();
  const bulkDelete = useBulkDeleteLocations({ onDeleted: selection.deselect });
  const failureReason = useDeleteFailureReason(
    "location.toast",
    resolveLocationDeleteToastKey,
  );

  useQueryErrorToast(isError, tToast("systemError"));

  const items = listData?.data ?? [];
  const rowLabels = useRowLabels(items, (row) => [row.id, row.code]);
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const hasActiveFilters = Boolean(
    committedSearch || columnFilters.activeCount > 0,
  );

  const deleteConfirmation = useDeleteConfirmation<Location>((target, close) =>
    deleteLocation.mutate(target.id, { onSettled: close }),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <ListPageLayout>
        <ListToolbar>
          <SearchInput
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChangeValue={setSearchQuery}
            onKeyDown={handleSearchKeyDown}
          />
          <PageToolbarActions
            addButtonLabel={canCreate ? t("addButton") : undefined}
            onAddClick={canCreate ? () => setCreateModalOpen(true) : undefined}
          />
        </ListToolbar>

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon={locationFeature.items[0]?.icon ?? "map-pin"}
                message={resolveListEmptyMessage(hasActiveFilters, {
                  empty: t("noItems"),
                  notFound: t("noItemsFound"),
                })}
              />
            }
            pagination={{
              currentPage,
              totalPages,
              totalItems,
              startIndex,
              endIndex,
              onPageChange: setCurrentPage,
              itemLabel: t("paginationItem"),
            }}
          >
            <LocationTable
              data={items}
              {...selection.tableProps}
              selectionActions={
                <PermissionGate permission={LOCATION_DELETE}>
                  <BulkDeleteAction
                    count={selection.count}
                    pending={bulkDelete.isPending}
                    labelOf={rowLabels}
                    resolveFailureReason={failureReason}
                    onConfirm={(close) =>
                      bulkDelete.mutate(selection.selectedIds, {
                        onSettled: close,
                      })
                    }
                  />
                </PermissionGate>
              }
              onEdit={setEditTarget}
              onDelete={deleteConfirmation.request}
              columnFilterParams={columnFilterScope(params)}
              {...columnFilters.tableProps}
              {...sorting.tableProps}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      <LocationFormModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {editTarget && (
        <LocationFormModal
          isOpen
          onClose={() => setEditTarget(null)}
          location={editTarget}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmation.isOpen}
        onCancel={deleteConfirmation.cancel}
        onConfirm={deleteConfirmation.confirm}
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDescription", {
          code: deleteConfirmation.target?.code ?? "",
          name: deleteConfirmation.target?.name ?? "",
        })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        pending={deleteLocation.isPending}
      />
    </>
  );
}

export default LocationListPage;
