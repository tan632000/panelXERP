"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

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
  customerPickerQueryKey,
  fetchCustomerPickerPage,
} from "@plugins/crm/_shared/gateways/customer-gateway";
import {
  ORDER_STATUSES,
  orderPageRoutes,
  type OrderStatus,
} from "@plugins/sales/order/constants";
import { useOrderList } from "@plugins/sales/order/hooks/api/useOrder";
import { orderFeature } from "@plugins/sales/order/order.feature";

import { OrderTable } from "./OrderTable";

import type { OrderListItem } from "@plugins/sales/order/types";

/** Customers offered by the filter at once. */
const CUSTOMER_OPTIONS_LIMIT = 100;

export function OrderListPage() {
  const t = useTranslations("order");
  const tToast = useTranslations("order.toast");
  const router = useRouter();

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
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
      status: omitAllFilter(status) as OrderStatus | undefined,
      customerId: customerId ? Number(customerId) : undefined,
    };
  }, [currentPage, committedSearch, status, customer]);

  const { data: listData, isLoading, isError } = useOrderList(params);
  useQueryErrorToast(isError, tToast("systemError"));

  const orders = listData?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: orders.length,
    });

  const hasActiveFilters = Boolean(
    committedSearch || omitAllFilter(status) || omitAllFilter(customer),
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
      options: ORDER_STATUSES.map((value) => ({
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

  const openOrder = (order: OrderListItem) =>
    router.push(orderPageRoutes.detail(order.id));

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
            isEmpty={orders.length === 0}
            emptyState={
              <EmptyState
                icon={orderFeature.items[0]?.icon ?? "clipboard-list"}
                message={resolveListEmptyMessage(hasActiveFilters, {
                  empty: t("noOrders"),
                  notFound: t("noOrdersFound"),
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
            <OrderTable data={orders} onOpen={openOrder} />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}

export default OrderListPage;
