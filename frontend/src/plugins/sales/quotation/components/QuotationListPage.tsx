"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { ListFilterToolbar } from "@/kernel/core/components/ui/ListFilterToolbar";
import { ListPageLayout } from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
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
  customerPickerQueryKey,
  fetchCustomerPickerPage,
} from "@plugins/crm/_shared/gateways/customer-gateway";
import {
  QUOTATION_VERSION_STATUSES,
  quotationPageRoutes,
  type QuotationVersionStatus,
} from "@plugins/sales/quotation/constants";
import { useQuotationList } from "@plugins/sales/quotation/hooks/api/useQuotation";
import { QUOTATION_CREATE } from "@plugins/sales/quotation/permissions/quotation.permissions";
import { quotationFeature } from "@plugins/sales/quotation/quotation.feature";

import { CreateQuotationDialog } from "./CreateQuotationDialog";
import { QuotationTable } from "./QuotationTable";

import type { QuotationListItem } from "@plugins/sales/quotation/types";

/** Customers offered by the filter at once. */
const CUSTOMER_OPTIONS_LIMIT = 100;

export function QuotationListPage() {
  const t = useTranslations("quotation");
  const tToast = useTranslations("quotation.toast");
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const {
    searchQuery: codeQuery,
    setSearchQuery: setCodeQuery,
    committedSearch: committedCode,
    handleSearchKeyDown: handleCodeKeyDown,
  } = useCommittedSearch({
    persistKey: "code",
    onCommit: () => setCurrentPage(1),
  });
  const [status, setStatus] = useListViewState("status", ALL_FILTER_VALUE);
  const [customer, setCustomer] = useListViewState(
    "customer",
    ALL_FILTER_VALUE,
  );

  // The customers endpoint applies the actor's data scope, so only their own are offered.
  const customerQuery = useQuery({
    queryKey: customerPickerQueryKey(`filter-${CUSTOMER_OPTIONS_LIMIT}`),
    queryFn: () =>
      fetchCustomerPickerPage({ page: 1, limit: CUSTOMER_OPTIONS_LIMIT }),
  });

  const params = useMemo(() => {
    const customerId = omitAllFilter(customer);
    return {
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      code: omitEmptySearch(committedCode),
      status: omitAllFilter(status) as QuotationVersionStatus | undefined,
      customerId: customerId ? Number(customerId) : undefined,
    };
  }, [currentPage, committedSearch, committedCode, status, customer]);

  const { data: listData, isLoading, isError } = useQuotationList(params);
  useQueryErrorToast(isError, tToast("systemError"));

  const quotations = listData?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: quotations.length,
    });

  const hasActiveFilters = Boolean(
    committedSearch ||
    committedCode ||
    omitAllFilter(status) ||
    omitAllFilter(customer),
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
      options: QUOTATION_VERSION_STATUSES.map((value) => ({
        value,
        label: t(`statuses.${value}`),
      })),
    },
    {
      key: "customer",
      value: customer,
      onChange: resetPage(setCustomer),
      allLabel: t("filters.customer"),
      options: (customerQuery.data?.data ?? []).map((entry) => ({
        value: String(entry.id),
        label: `${entry.code} — ${entry.name}`,
      })),
    },
  ];

  const openQuotation = (quotation: QuotationListItem) =>
    router.push(quotationPageRoutes.detail(quotation.id));

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
          add={{
            label: t("create"),
            onClick: () => setCreating(true),
            permission: QUOTATION_CREATE,
          }}
        >
          <SearchInput
            placeholder={t("filters.codePlaceholder")}
            aria-label={t("filters.code")}
            value={codeQuery}
            onChangeValue={setCodeQuery}
            onKeyDown={handleCodeKeyDown}
          />
        </ListFilterToolbar>

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={quotations.length === 0}
            emptyState={
              <EmptyState
                icon={quotationFeature.items[0]?.icon ?? "file-invoice"}
                message={resolveListEmptyMessage(hasActiveFilters, {
                  empty: t("noQuotations"),
                  notFound: t("noQuotationsFound"),
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
            <QuotationTable data={quotations} onOpen={openQuotation} />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      <CreateQuotationDialog
        isOpen={creating}
        onClose={() => setCreating(false)}
      />
    </>
  );
}

export default QuotationListPage;
