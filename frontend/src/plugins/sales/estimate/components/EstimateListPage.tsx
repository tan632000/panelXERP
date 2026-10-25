"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

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
import {
  ALL_FILTER_VALUE,
  omitAllFilter,
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  ESTIMATE_LIST_STATUSES,
  estimatePageRoutes,
  type EstimateListStatus,
} from "@plugins/sales/estimate/constants";
import { estimateFeature } from "@plugins/sales/estimate/estimate.feature";
import { useEstimateList } from "@plugins/sales/estimate/hooks/api/useEstimate";
import { useEngineerOptions } from "@plugins/sales/request/hooks/api/useRequest";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";

import { EstimateTable } from "./EstimateTable";

import type { EstimateListItem } from "@plugins/sales/estimate/types";

export function EstimateListPage() {
  const t = useTranslations("estimate");
  const tToast = useTranslations("estimate.toast");
  const router = useRouter();
  const { can } = useAuth();
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

  const engineerQuery = useEngineerOptions(canFilterByEngineer);

  const params = useMemo(() => {
    const engineerId = omitAllFilter(engineer);
    return {
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      status: omitAllFilter(status) as EstimateListStatus | undefined,
      assignedEngineerId: engineerId ? Number(engineerId) : undefined,
    };
  }, [currentPage, committedSearch, status, engineer]);

  const { data: listData, isLoading, isError } = useEstimateList(params);
  useQueryErrorToast(isError, tToast("systemError"));

  const estimates = listData?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: estimates.length,
    });

  const hasActiveFilters = Boolean(
    committedSearch || omitAllFilter(status) || omitAllFilter(engineer),
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
      options: ESTIMATE_LIST_STATUSES.map((value) => ({
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

  const openEstimate = (estimate: EstimateListItem) =>
    router.push(estimatePageRoutes.detail(estimate.id));

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
        />

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={estimates.length === 0}
            emptyState={
              <EmptyState
                icon={estimateFeature.items[0]?.icon ?? "calculator"}
                message={resolveListEmptyMessage(hasActiveFilters, {
                  empty: t("noEstimates"),
                  notFound: t("noEstimatesFound"),
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
            <EstimateTable data={estimates} onOpen={openEstimate} />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}

export default EstimateListPage;
