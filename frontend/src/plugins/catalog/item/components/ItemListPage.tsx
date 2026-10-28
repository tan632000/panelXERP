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
import { ScanInput } from "@/kernel/core/components/ui/ScanInput";
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
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { columnFilterScope } from "@/kernel/core/lib/table-column-filter";
import { PermissionGate } from "@/kernel/core/permissions/PermissionGate";

import {
  useBulkDeleteItems,
  useDeleteItem,
  useItemList,
} from "@plugins/catalog/item/hooks/api/useItem";
import { useResolveItem } from "@plugins/catalog/item/hooks/useResolveItem";
import { itemFeature } from "@plugins/catalog/item/item.feature";
import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";
import { ITEM_DELETE } from "@plugins/catalog/item/permissions/item.permissions";
import { resolveItemDeleteToastKey } from "@plugins/catalog/item/utils/map-item-api-errors";

import { ItemFormModal } from "./ItemFormModal";
import { ItemImportDialog } from "./ItemImportDialog";
import { ItemLabelPrint } from "./ItemLabelPrint";
import { ItemTable } from "./ItemTable";

import type { Item } from "@plugins/catalog/item/types";

export function ItemListPage() {
  const t = useTranslations("item");
  const tCommon = useTranslations("common");
  const tToast = useTranslations("item.toast");
  const { can } = useAuth();
  const canCreate = can(ItemPermission.create);
  const canImport = can(ItemPermission.import);
  // The form also carries the warehouse settings, which have a scope of their own.
  const canEdit =
    can(ItemPermission.update) || can(ItemPermission.stockSettings);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const {
    searchQuery,
    setSearchQuery,
    committedSearch,
    setCommittedSearch,
    handleSearchKeyDown,
  } = useCommittedSearch({
    persistKey: "search",
    onCommit: () => setCurrentPage(1),
  });
  const resolveItem = useResolveItem();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Item | null>(null);

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

  const { data: listData, isLoading, isError } = useItemList(params);
  const deleteItem = useDeleteItem();
  const bulkDelete = useBulkDeleteItems({ onDeleted: selection.deselect });
  const failureReason = useDeleteFailureReason(
    "item.toast",
    resolveItemDeleteToastKey,
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

  /** A scan opens the item's form; a reader who cannot edit gets it filtered in the list. */
  const handleScanned = (item: Item) => {
    if (canEdit) {
      setEditTarget(item);
      return;
    }
    setSearchQuery(item.code);
    setCommittedSearch(item.code);
    setCurrentPage(1);
  };

  const deleteConfirmation = useDeleteConfirmation<Item>((target, close) =>
    deleteItem.mutate(target.id, { onSettled: close }),
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
          <ScanInput
            resolve={resolveItem}
            onResult={handleScanned}
            errorMessage={(error) =>
              isNotFoundError(error) ? t("scan.notFound") : t("scan.failed")
            }
            placeholder={t("scan.placeholder")}
            // The form owns the keyboard while it is open; the field is taken back when it closes.
            disabled={createModalOpen || editTarget !== null}
          />
          <PageToolbarActions
            showExport={false}
            showImport={canImport}
            onImportClick={canImport ? () => setImportOpen(true) : undefined}
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
                icon={itemFeature.items[0]?.icon ?? "tag"}
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
            <ItemTable
              data={items}
              {...selection.tableProps}
              selectionActions={
                <>
                  <ItemLabelPrint ids={selection.selectedIds} />
                  <PermissionGate permission={ITEM_DELETE}>
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
                </>
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

      <ItemFormModal
        isOpen={createModalOpen || editTarget !== null}
        onClose={() => {
          setCreateModalOpen(false);
          setEditTarget(null);
        }}
        item={editTarget}
      />

      {canImport ? (
        <ItemImportDialog
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
        />
      ) : null}

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
        pending={deleteItem.isPending}
      />
    </>
  );
}

export default ItemListPage;
