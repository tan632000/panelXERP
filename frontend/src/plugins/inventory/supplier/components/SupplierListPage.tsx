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
  useBulkDeleteSuppliers,
  useDeleteSupplier,
  useSupplierList,
} from "@plugins/inventory/supplier/hooks/api/useSupplier";
import { SupplierPermission } from "@plugins/inventory/supplier/permissions/supplier-permission.keys";
import { SUPPLIER_DELETE } from "@plugins/inventory/supplier/permissions/supplier.permissions";
import { supplierFeature } from "@plugins/inventory/supplier/supplier.feature";
import { resolveSupplierDeleteToastKey } from "@plugins/inventory/supplier/utils/map-supplier-api-errors";

import { SupplierFormModal } from "./SupplierFormModal";
import { SupplierTable } from "./SupplierTable";

import type { Supplier } from "@plugins/inventory/supplier/types";

export function SupplierListPage() {
  const t = useTranslations("supplier");
  const tCommon = useTranslations("common");
  const tToast = useTranslations("supplier.toast");
  const { can } = useAuth();
  const canCreate = can(SupplierPermission.create);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);

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

  const { data: listData, isLoading, isError } = useSupplierList(params);
  const deleteSupplier = useDeleteSupplier();
  const bulkDelete = useBulkDeleteSuppliers({ onDeleted: selection.deselect });
  const failureReason = useDeleteFailureReason(
    "supplier.toast",
    resolveSupplierDeleteToastKey,
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

  const deleteConfirmation = useDeleteConfirmation<Supplier>((target, close) =>
    deleteSupplier.mutate(target.id, { onSettled: close }),
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
                icon={supplierFeature.items[0]?.icon ?? "truck"}
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
            <SupplierTable
              data={items}
              {...selection.tableProps}
              selectionActions={
                <PermissionGate permission={SUPPLIER_DELETE}>
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

      <SupplierFormModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {editTarget && (
        <SupplierFormModal
          isOpen
          onClose={() => setEditTarget(null)}
          supplier={editTarget}
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
        pending={deleteSupplier.isPending}
      />
    </>
  );
}

export default SupplierListPage;
