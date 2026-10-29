"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
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

import { purchaseOrderPageRoutes } from "@plugins/inventory/purchase-order/constants";
import { useReceiptList } from "@plugins/inventory/receipt/hooks/api/useReceipt";
import { receiptFeature } from "@plugins/inventory/receipt/receipt.feature";

import { ReceiptTable } from "./ReceiptTable";

/** Receipts posted so far; a receipt starts from its approved purchase order. */
export function ReceiptListPage() {
  const t = useTranslations("receipt");
  const router = useRouter();

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
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
    }),
    [currentPage, committedSearch],
  );
  const { data: listData, isLoading, isError } = useReceiptList(params);
  useQueryErrorToast(isError, t("loadError"));

  const items = listData?.data ?? [];
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
        </ListToolbar>

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon={receiptFeature.items[0]?.icon ?? "package-import"}
                message={resolveListEmptyMessage(Boolean(committedSearch), {
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
            <ReceiptTable
              data={items}
              onOpenOrder={(row) =>
                router.push(purchaseOrderPageRoutes.detail(row.purchaseOrderId))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
