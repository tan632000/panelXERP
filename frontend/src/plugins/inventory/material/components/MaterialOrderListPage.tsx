"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import { materialPageRoutes } from "@plugins/inventory/material/constants";
import { useMaterialOrders } from "@plugins/inventory/material/hooks/api/useMaterial";
import { materialFeature } from "@plugins/inventory/material/material.feature";
import { OrderStatusBadge } from "@plugins/sales/order/components/OrderStatusBadge";
import {
  ORDER_STATUSES,
  type OrderStatus,
} from "@plugins/sales/order/constants";

import type { MaterialOrderRow } from "@plugins/inventory/material/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** Orders by delivery date, with how many of their items are still short. */
export function MaterialOrderListPage() {
  const t = useTranslations("material");
  const tOrder = useTranslations("order");
  const router = useRouter();

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [status, setStatus] = useListViewState<string>("status", "");
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });

  const params = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      status: (status || undefined) as OrderStatus | undefined,
    }),
    [currentPage, committedSearch, status],
  );
  const { data, isLoading, isError } = useMaterialOrders(params);
  useQueryErrorToast(isError, t("loadError"));

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<MaterialOrderRow>> = [
    {
      key: "code",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("orderCode"),
      render: (_, row) => (
        <span className="font-mono font-semibold text-text-primary">
          {row.code}
        </span>
      ),
    },
    { key: "customerName", ...PLAIN, header: t("customer") },
    {
      key: "status",
      ...PLAIN,
      header: t("status"),
      render: (_, row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: "deliveryDate",
      ...PLAIN,
      header: t("deliveryDate"),
      render: (_, row) =>
        row.deliveryDate ? formatIsoDate(row.deliveryDate) : t("emptyValue"),
    },
    {
      key: "shortLineCount",
      ...PLAIN,
      header: t("shortLineCount"),
      render: (_, row) => (
        <span
          className={
            row.shortLineCount > 0
              ? "font-semibold text-danger-text tabular-nums"
              : "tabular-nums"
          }
          data-testid={`short-count-${row.id}`}
        >
          {row.shortLineCount}
        </span>
      ),
    },
    {
      key: "salesOwnerName",
      ...PLAIN,
      header: t("salesOwner"),
      render: (_, row) => row.salesOwnerName ?? t("emptyValue"),
    },
  ];

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
          <FormSelect
            label={t("status")}
            labelHidden
            placeholder={t("allStatuses")}
            allowClear
            searchable={false}
            value={status}
            options={ORDER_STATUSES.map((value) => ({
              value,
              label: tOrder(`statuses.${value}`),
            }))}
            onChange={(event) => {
              setStatus(event.target.value);
              setCurrentPage(1);
            }}
          />
        </ListToolbar>
        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon={materialFeature.items[0]?.icon ?? "package"}
                message={resolveListEmptyMessage(
                  Boolean(committedSearch || status),
                  { empty: t("noOrders"), notFound: t("noOrdersFound") },
                )}
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
              rowKey={(row) => String(row.id)}
              onRowClick={(row) =>
                router.push(materialPageRoutes.order(row.id))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}

export default MaterialOrderListPage;
