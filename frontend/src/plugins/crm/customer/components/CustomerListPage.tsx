"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useMemo, useState } from "react";

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
import { useRouter } from "@/kernel/i18n/navigation";

import { customerPageRoutes } from "@plugins/crm/customer/constants";
import { customerFeature } from "@plugins/crm/customer/customer.feature";
import {
  useBulkDeleteCustomers,
  useCustomerList,
  useDeleteCustomer,
} from "@plugins/crm/customer/hooks/api/useCustomer";
import { CustomerPermission } from "@plugins/crm/customer/permissions/customer-permission.keys";
import { CUSTOMER_DELETE } from "@plugins/crm/customer/permissions/customer.permissions";
import { resolveCustomerDeleteToastKey } from "@plugins/crm/customer/utils/map-customer-api-errors";

import { CreateCustomerModal } from "./CreateCustomerModal";
import { CustomerTable } from "./CustomerTable";
import { EditCustomerModal } from "./EditCustomerModal";

import type { Customer } from "@plugins/crm/customer/types";

export function CustomerListPage() {
  const t = useTranslations("customer");
  const tCommon = useTranslations("common");
  const tToast = useTranslations("customer.toast");
  const { can } = useAuth();
  const router = useRouter();
  const canCreate = can(CustomerPermission.create);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);

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

  const { data: listData, isLoading, isError } = useCustomerList(params);
  const deleteCustomer = useDeleteCustomer();
  const bulkDelete = useBulkDeleteCustomers({ onDeleted: selection.deselect });
  const failureReason = useDeleteFailureReason(
    "customer.toast",
    resolveCustomerDeleteToastKey,
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

  const deleteConfirmation = useDeleteConfirmation<Customer>(
    (target, close) => deleteCustomer.mutate(target.id, { onSettled: close }),
  );

  const handleRowClick = useCallback(
    (item: Customer) => router.push(customerPageRoutes.detail(item.id)),
    [router],
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
                icon={customerFeature.items[0]?.icon ?? "users"}
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
            <CustomerTable
              data={items}
              {...selection.tableProps}
              selectionActions={
                <PermissionGate permission={CUSTOMER_DELETE}>
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
              onRowClick={handleRowClick}
              onEdit={setEditTarget}
              onDelete={deleteConfirmation.request}
              columnFilterParams={columnFilterScope(params)}
              {...columnFilters.tableProps}
              {...sorting.tableProps}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      <CreateCustomerModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {editTarget && (
        <EditCustomerModal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          customer={editTarget}
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
        pending={deleteCustomer.isPending}
      />
    </>
  );
}

export default CustomerListPage;
