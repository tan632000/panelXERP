"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DropdownSelect } from "@/kernel/core/components/ui/DropdownSelect";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { PageToolbarActions } from "@/kernel/core/components/ui/PageToolbarActions";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useDeleteConfirmation } from "@/kernel/core/hooks/useDeleteConfirmation";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";

import {
  useDeleteTemplate,
  useSetTemplateActive,
  useTemplateList,
} from "@plugins/sales/template/hooks/useTemplates";
import { TemplatePermission } from "@plugins/sales/template/permissions/template-permission.keys";
import { templateFeature } from "@plugins/sales/template/template.feature";

import { TemplateFormModal } from "./TemplateFormModal";

import type { QuotationTemplate } from "@plugins/sales/template/types";

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary transition-colors hover:bg-surface-secondary";

export function TemplateListPage() {
  const t = useTranslations("template");
  const tCommon = useTranslations("common");
  const tToast = useTranslations("template.toast");
  const { can } = useAuth();
  const canCreate = can(TemplatePermission.create);
  const canUpdate = can(TemplatePermission.update);
  const canDelete = can(TemplatePermission.delete);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const [statusFilter, setStatusFilter] = useListViewState("status", "all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuotationTemplate | null>(null);

  const params = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
    }),
    [currentPage, committedSearch, statusFilter],
  );

  const { data: listData, isLoading, isError } = useTemplateList(params);
  const deleteTemplate = useDeleteTemplate();
  const setActive = useSetTemplateActive();
  useQueryErrorToast(isError, tToast("systemError"));

  const items = listData?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: items.length,
    });
  const hasActiveFilters = Boolean(committedSearch || statusFilter !== "all");

  const deleteConfirmation = useDeleteConfirmation<QuotationTemplate>(
    (target, close) => deleteTemplate.mutate(target.id, { onSettled: close }),
  );

  const columns = useMemo(() => {
    const text = (value?: string | null) => (
      <span
        className="block truncate text-text-secondary"
        title={value ?? undefined}
      >
        {value || t("emptyValue")}
      </span>
    );
    const base: Array<TableColumn<QuotationTemplate>> = [
      {
        key: "code",
        mobile: { role: "title", record: true },
        header: t("code"),
        filterable: false,
        sortable: false,
        render: (_, item) => (
          <span className="font-semibold text-text-primary">{item.code}</span>
        ),
      },
      {
        key: "name",
        header: t("name"),
        filterable: false,
        sortable: false,
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
        key: "description",
        header: t("descriptionField"),
        filterable: false,
        sortable: false,
        render: text,
      },
      {
        key: "isActive",
        header: t("status"),
        filterable: false,
        sortable: false,
        render: (_, item) =>
          text(item.isActive ? t("statusActive") : t("statusInactive")),
      },
    ];
    if (!canUpdate && !canDelete) return base;
    return [
      ...base,
      {
        key: "actions",
        header: "",
        filterable: false,
        sortable: false,
        render: (_, item) => (
          <div className="flex gap-[3px]" onClick={(e) => e.stopPropagation()}>
            {canUpdate && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-text-secondary hover:text-text-primary`}
                onClick={() => setEditTarget(item)}
                title={tCommon("edit")}
              >
                <Icon name="edit" size={15} />
              </button>
            )}
            {canUpdate && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-text-secondary hover:text-text-primary`}
                disabled={setActive.isPending}
                onClick={() =>
                  setActive.mutate({ id: item.id, isActive: !item.isActive })
                }
                title={item.isActive ? t("deactivate") : t("activate")}
              >
                <Icon name={item.isActive ? "ban" : "circle-check"} size={15} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-danger-text hover:text-danger-text`}
                onClick={() => deleteConfirmation.request(item)}
                title={tCommon("delete")}
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [canDelete, canUpdate, deleteConfirmation, setActive, t, tCommon]);

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
                icon={templateFeature.items[0]?.icon ?? "file-description"}
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
            <Table
              columns={columns}
              data={items}
              rowKey={(item) => String(item.id)}
              onRowClick={canUpdate ? setEditTarget : undefined}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      <TemplateFormModal
        isOpen={createModalOpen || editTarget !== null}
        onClose={() => {
          setCreateModalOpen(false);
          setEditTarget(null);
        }}
        template={editTarget}
      />

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
        pending={deleteTemplate.isPending}
      />
    </>
  );
}

export default TemplateListPage;
