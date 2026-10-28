"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
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
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  PURCHASE_ORDER_STATUSES,
  purchaseOrderPageRoutes,
  type PurchaseOrderStatus,
} from "@plugins/inventory/purchase-order/constants";
import { usePurchaseOrderList } from "@plugins/inventory/purchase-order/hooks/api/usePurchaseOrder";
import { PurchaseOrderPermission } from "@plugins/inventory/purchase-order/permissions/purchase-order-permission.keys";
import { purchaseOrderFeature } from "@plugins/inventory/purchase-order/purchase-order.feature";

import { PurchaseOrderTable } from "./PurchaseOrderTable";

export function PurchaseOrderListPage() {
  const t = useTranslations("purchaseOrder");
  const { can } = useAuth();
  const router = useRouter();
  const canCreate = can(PurchaseOrderPermission.create);

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
      status: (status || undefined) as PurchaseOrderStatus | undefined,
    }),
    [currentPage, committedSearch, status],
  );

  const { data: listData, isLoading, isError } = usePurchaseOrderList(params);
  useQueryErrorToast(isError, t("loadError"));

  const items = listData?.data ?? [];
  // The API sends money keys only to an actor holding `purchase_price:read`.
  const showCosts = items.some((row) => "total" in row);
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

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
            options={PURCHASE_ORDER_STATUSES.map((value) => ({
              value,
              label: t(`statuses.${value}`),
            }))}
            onChange={(event) => {
              setStatus(event.target.value);
              setCurrentPage(1);
            }}
          />
          <PageToolbarActions
            addButtonLabel={canCreate ? t("addButton") : undefined}
            onAddClick={
              canCreate
                ? () => router.push(purchaseOrderPageRoutes.create)
                : undefined
            }
          />
        </ListToolbar>

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon={purchaseOrderFeature.items[0]?.icon ?? "file-invoice"}
                message={resolveListEmptyMessage(
                  Boolean(committedSearch || status),
                  { empty: t("noItems"), notFound: t("noItemsFound") },
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
            <PurchaseOrderTable
              data={items}
              showCosts={showCosts}
              onOpen={(row) =>
                router.push(purchaseOrderPageRoutes.detail(row.id))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}

export default PurchaseOrderListPage;
