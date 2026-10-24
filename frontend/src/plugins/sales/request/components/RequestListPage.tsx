"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { ListFilterToolbar } from "@/kernel/core/components/ui/ListFilterToolbar";
import { ListPageLayout } from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { useTableColumnFilters } from "@/kernel/core/hooks/useTableColumnFilters";
import { useTableSort } from "@/kernel/core/hooks/useTableSort";
import {
  ALL_FILTER_VALUE,
  omitAllFilter,
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { columnFilterScope } from "@/kernel/core/lib/table-column-filter";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  REQUEST_STATUSES,
  requestPageRoutes,
  type RequestStatus,
} from "@plugins/sales/request/constants";
import {
  useEngineerOptions,
  useRequestList,
} from "@plugins/sales/request/hooks/api/useRequest";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";
import { requestFeature } from "@plugins/sales/request/request.feature";

import { RequestFormModal } from "./RequestFormModal";
import { RequestTable } from "./RequestTable";

import type { RequestListItem } from "@plugins/sales/request/types";

export function RequestListPage() {
  const t = useTranslations("request");
  const tToast = useTranslations("request.toast");
  const router = useRouter();
  const { can } = useAuth();
  const canCreate = can(RequestPermission.create);
  // The engineer options sit behind request:assign; a reader without it has no such filter.
  const canFilterByEngineer = can(RequestPermission.assign);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const [status, setStatus] = useListViewState("status", ALL_FILTER_VALUE);
  const [engineer, setEngineer] = useListViewState(
    "engineer",
    ALL_FILTER_VALUE,
  );
  const [dueFrom, setDueFrom] = useListViewState("dueFrom", "");
  const [dueTo, setDueTo] = useListViewState("dueTo", "");
  const [createOpen, setCreateOpen] = useState(false);

  const columnFilters = useTableColumnFilters({
    persistKey: "columnFilters",
    onChange: () => setCurrentPage(1),
  });
  const sorting = useTableSort({
    persistKey: "sort",
    onChange: () => setCurrentPage(1),
  });

  const engineerQuery = useEngineerOptions(canFilterByEngineer);

  const params = useMemo(() => {
    const engineerId = omitAllFilter(engineer);
    return {
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      status: omitAllFilter(status) as RequestStatus | undefined,
      assignedEngineerId: engineerId ? Number(engineerId) : undefined,
      quotationDueFrom: dueFrom || undefined,
      quotationDueTo: dueTo || undefined,
      columnFilters: columnFilters.param,
      ...sorting.params,
    };
  }, [
    currentPage,
    committedSearch,
    status,
    engineer,
    dueFrom,
    dueTo,
    columnFilters.param,
    sorting.params,
  ]);

  const { data: listData, isLoading, isError } = useRequestList(params);
  useQueryErrorToast(isError, tToast("systemError"));

  const requests = listData?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: requests.length,
    });

  const hasActiveFilters = Boolean(
    committedSearch ||
    omitAllFilter(status) ||
    omitAllFilter(engineer) ||
    dueFrom ||
    dueTo ||
    columnFilters.activeCount > 0,
  );

  const resetPage = <T,>(setter: (value: T) => void) => {
    return (value: T) => {
      setter(value);
      setCurrentPage(1);
    };
  };

  const selects = [
    {
      key: "status",
      value: status,
      onChange: resetPage(setStatus),
      allLabel: t("filters.status"),
      options: REQUEST_STATUSES.map((value) => ({
        value,
        label: t(`statuses.${value}`),
      })),
    },
    ...(canFilterByEngineer
      ? [
          {
            key: "engineer",
            value: engineer,
            onChange: resetPage(setEngineer),
            allLabel: t("filters.engineer"),
            options: (engineerQuery.data ?? []).map((option) => ({
              value: String(option.id),
              label: option.fullName,
            })),
          },
        ]
      : []),
  ];

  const openRequest = (request: RequestListItem) =>
    router.push(requestPageRoutes.detail(request.id));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <ListPageLayout>
        <ListFilterToolbar
          search={{
            placeholder: t("searchPlaceholder"),
            value: searchQuery,
            onChange: setSearchQuery,
            onKeyDown: handleSearchKeyDown,
          }}
          selects={selects}
          dateRange={{
            dateFrom: dueFrom,
            dateTo: dueTo,
            onDateFromChange: resetPage(setDueFrom),
            onDateToChange: resetPage(setDueTo),
          }}
          add={
            canCreate
              ? {
                  label: t("addButton"),
                  onClick: () => setCreateOpen(true),
                  permission: RequestPermission.create,
                }
              : undefined
          }
        />

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={requests.length === 0}
            emptyState={
              <EmptyState
                icon={requestFeature.items[0]?.icon ?? "file-text"}
                message={resolveListEmptyMessage(hasActiveFilters, {
                  empty: t("noRequests"),
                  notFound: t("noRequestsFound"),
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
            <RequestTable
              data={requests}
              onOpen={openRequest}
              columnFilterParams={columnFilterScope(params)}
              {...columnFilters.tableProps}
              {...sorting.tableProps}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      <RequestFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={openRequest}
      />
    </>
  );
}

export default RequestListPage;
