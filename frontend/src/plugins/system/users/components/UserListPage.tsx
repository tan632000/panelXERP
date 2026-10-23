"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { useCallback, useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { BulkApproveAction } from "@/kernel/core/components/ui/BulkApproveAction";
import { BulkDeleteAction } from "@/kernel/core/components/ui/BulkDeleteAction";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DropdownSelect } from "@/kernel/core/components/ui/DropdownSelect";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { PageToolbarActions } from "@/kernel/core/components/ui/PageToolbarActions";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useBulkSelection } from "@/kernel/core/hooks/useBulkSelection";
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { useRowLabels } from "@/kernel/core/hooks/useRowLabels";
import { useTableColumnFilters } from "@/kernel/core/hooks/useTableColumnFilters";
import { useTableExport } from "@/kernel/core/hooks/useTableExport";
import { useTableSort } from "@/kernel/core/hooks/useTableSort";
import { useUserDepartments } from "@/kernel/core/hooks/useUserDepartments";
import { appToday } from "@/kernel/core/lib/app-today";
import {
  omitAllFilter,
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { columnFilterScope } from "@/kernel/core/lib/table-column-filter";
import { useRouter } from "@/kernel/i18n/navigation";

import { useRoleLabels } from "@plugins/system/roles/hooks/useRoleLabels";
import {
  adminUserApiRoutes,
  SIGNATURE_REVIEW_PARAM,
  USER_LIST_PREFERENCE_KEY,
  USER_EXPORT,
  USER_IMPORT,
} from "@plugins/system/users/constants";
import {
  useAdminUser,
  useAdminUserList,
  useAssignableRoles,
  useBulkApproveAdminUserSignatures,
  useBulkDeactivateAdminUsers,
  useBulkDeleteAdminUsers,
  useDeleteAdminUser,
  useSetAdminUserActive,
} from "@plugins/system/users/hooks/api/useAdminUsers";
import { buildUserExcelColumns } from "@plugins/system/users/utils/user-excel-columns";

import { BulkDeactivateAction } from "./BulkDeactivateAction";
import { ImportUsersModal } from "./ImportUsersModal";
import { SignatureReviewModal } from "./SignatureReviewModal";
import { UserFormModal } from "./UserFormModal";
import { UserTable } from "./UserTable";

import type { AdminUser } from "@plugins/system/users/types";

export function UserListPage() {
  const t = useTranslations("system.users");
  const tCommon = useTranslations("common");
  const { user, can } = useAuth();
  const canExport = can(USER_EXPORT);
  const canImport = can(USER_IMPORT);
  const assignableRoles = useAssignableRoles().data;
  const roles = useMemo(() => assignableRoles ?? [], [assignableRoles]);
  const { labelOfCode, labelOfName } = useRoleLabels();
  const { options: departmentOptions } = useUserDepartments();

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [roleFilter, setRoleFilter] = useListViewState("role", "all");
  const [statusFilter, setStatusFilter] = useListViewState("status", "all");
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const columnFilters = useTableColumnFilters({
    persistKey: "columnFilters",
    onChange: () => setCurrentPage(1),
  });
  const sorting = useTableSort({
    persistKey: "sort",
    onChange: () => setCurrentPage(1),
  });
  const selection = useBulkSelection();

  const [formTarget, setFormTarget] = useState<AdminUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AdminUser | null>(null);

  // A signature-review notification lands here naming the account; that account may sit on
  // any page of the list, so it is read on its own.
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedReviewId = Number(searchParams?.get(SIGNATURE_REVIEW_PARAM));
  const linkedReview = useAdminUser(
    Number.isInteger(linkedReviewId) && linkedReviewId > 0
      ? linkedReviewId
      : null,
  ).data;
  const reviewUser = reviewTarget ?? linkedReview ?? null;
  const closeReview = () => {
    setReviewTarget(null);
    if (linkedReview) router.replace("/system/users");
  };

  const params = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      roleCode: omitAllFilter(roleFilter),
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
      columnFilters: columnFilters.param,
      ...sorting.params,
    }),
    [
      currentPage,
      committedSearch,
      roleFilter,
      statusFilter,
      columnFilters.param,
      sorting.params,
    ],
  );

  const { data: listData, isLoading, isError } = useAdminUserList(params);
  const setActive = useSetAdminUserActive();
  const bulkApprove = useBulkApproveAdminUserSignatures({
    onApproved: selection.deselect,
  });
  const bulkDeactivate = useBulkDeactivateAdminUsers({
    onDeactivated: selection.deselect,
  });
  const removeUser = useDeleteAdminUser();
  const bulkDelete = useBulkDeleteAdminUsers({ onDeleted: selection.deselect });
  useQueryErrorToast(isError, t("toast.systemError"));

  const items = listData?.data ?? [];
  const rowLabels = useRowLabels(items, (row) => [
    row.id,
    row.fullName || row.username,
  ]);
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const hasActiveFilters = Boolean(
    committedSearch ||
    omitAllFilter(roleFilter) ||
    statusFilter !== "all" ||
    columnFilters.activeCount > 0,
  );

  // Excel export lays out the table's columns with the reader's labels, so the enum cells
  // resolve through the same label maps the table draws. The import template draws from the
  // same column list.
  const exportColumns = useMemo(
    () =>
      buildUserExcelColumns((key) => t(key), {
        roleName: Object.fromEntries(
          roles.map((role) => [role.name, labelOfName(role.name)]),
        ),
        department: Object.fromEntries(
          departmentOptions.map((option) => [option.value, option.label]),
        ),
        isActive: {
          true: t("statusActive"),
          false: t("statusInactive"),
        },
      }),
    [roles, labelOfName, departmentOptions, t],
  );

  const { exportRows } = useTableExport({
    endpoint: adminUserApiRoutes.export,
    columns: exportColumns,
    columnPreferenceKey: USER_LIST_PREFERENCE_KEY,
    fileName: `nguoi-dung_${appToday()}`,
    label: t("title"),
  });

  /** Every account the current search/filters/sort match, not just the loaded page. */
  const handleExport = useCallback(() => {
    const { page: _page, limit: _limit, ...query } = params;
    void exportRows(query as Record<string, unknown>);
  }, [exportRows, params]);

  const openCreate = () => {
    setFormTarget(null);
    setFormOpen(true);
  };

  const openEdit = (user: AdminUser) => {
    setFormTarget(user);
    setFormOpen(true);
  };

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
          <DropdownSelect
            showFilterIcon
            allowClear
            clearValue="all"
            value={roleFilter}
            onChange={(value) => {
              setRoleFilter(value);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: t("filterRole") },
              ...roles.map((role) => ({
                value: role.code,
                label: labelOfCode(role.code, role.name),
              })),
            ]}
          />
          <DropdownSelect
            showFilterIcon
            allowClear
            clearValue="all"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: t("filterStatus") },
              { value: "active", label: t("statusActive") },
              { value: "inactive", label: t("statusInactive") },
            ]}
          />
          <PageToolbarActions
            showExport={canExport}
            onExportClick={canExport ? handleExport : undefined}
            showImport={canImport}
            onImportClick={canImport ? () => setImportOpen(true) : undefined}
            addButtonLabel={t("addButton")}
            onAddClick={openCreate}
          />
        </ListToolbar>

        <ListQueryBody
          isLoading={isLoading}
          isEmpty={items.length === 0}
          emptyState={
            <EmptyState
              icon="users"
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
          <UserTable
            data={items}
            currentUserId={user?.id}
            {...selection.tableProps}
            selectionActions={
              <>
                <BulkApproveAction
                  count={selection.count}
                  pending={bulkApprove.isPending}
                  labelOf={rowLabels}
                  onConfirm={(settle) =>
                    bulkApprove.mutate(selection.selectedIds, {
                      onSettled: settle,
                    })
                  }
                />
                <BulkDeactivateAction
                  count={selection.count}
                  pending={bulkDeactivate.isPending}
                  onConfirm={(close) =>
                    bulkDeactivate.mutate(selection.selectedIds, {
                      onSettled: close,
                    })
                  }
                />
                <BulkDeleteAction
                  count={selection.count}
                  pending={bulkDelete.isPending}
                  onConfirm={(settle) =>
                    bulkDelete.mutate(selection.selectedIds, {
                      onSettled: (result) => settle(result),
                    })
                  }
                />
              </>
            }
            onEdit={openEdit}
            onToggleActive={setActiveTarget}
            onDelete={setDeleteTarget}
            onReviewSignature={setReviewTarget}
            columnFilterParams={columnFilterScope(params)}
            {...columnFilters.tableProps}
            {...sorting.tableProps}
          />
        </ListQueryBody>
      </ListPageLayout>

      {formOpen && (
        <UserFormModal
          // A fresh instance per account, so the form opens on that account's own values.
          key={formTarget?.id ?? "new"}
          isOpen
          onClose={() => setFormOpen(false)}
          user={formTarget}
        />
      )}

      {reviewUser && (
        <SignatureReviewModal
          key={reviewUser.id}
          user={reviewUser}
          onClose={closeReview}
        />
      )}

      {importOpen && (
        <ImportUsersModal isOpen onClose={() => setImportOpen(false)} />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          removeUser.mutate(deleteTarget.id, {
            onSettled: () => setDeleteTarget(null),
          });
        }}
        variant="danger"
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDescription", {
          name: deleteTarget?.fullName ?? "",
        })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("delete")}
        pending={removeUser.isPending}
      />

      <ConfirmDialog
        open={Boolean(activeTarget)}
        onCancel={() => setActiveTarget(null)}
        onConfirm={() => {
          if (!activeTarget) return;
          setActive.mutate(
            { id: activeTarget.id, isActive: !activeTarget.isActive },
            { onSettled: () => setActiveTarget(null) },
          );
        }}
        variant={activeTarget?.isActive ? "danger" : "default"}
        title={
          activeTarget?.isActive
            ? t("confirmDeactivateTitle")
            : t("confirmActivateTitle")
        }
        description={
          activeTarget?.isActive
            ? t("confirmDeactivateDescription", {
                name: activeTarget?.fullName ?? "",
              })
            : t("confirmActivateDescription", {
                name: activeTarget?.fullName ?? "",
              })
        }
        cancelLabel={tCommon("cancel")}
        confirmLabel={activeTarget?.isActive ? t("deactivate") : t("activate")}
        pending={setActive.isPending}
      />
    </>
  );
}

export default UserListPage;
