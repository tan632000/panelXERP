"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormCheckbox } from "@/kernel/core/components/ui/FormCheckbox";
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

import { useStockList } from "@plugins/inventory/stock/hooks/api/useStock";
import { StockPermission } from "@plugins/inventory/stock/permissions/stock-permission.keys";
import { stockFeature } from "@plugins/inventory/stock/stock.feature";

import { StockLedgerDrawer } from "./StockLedgerDrawer";
import { StockTable } from "./StockTable";

import type { StockRow } from "@plugins/inventory/stock/types";

export function StockListPage() {
  const t = useTranslations("stock");
  const { can } = useAuth();
  const canReadLedger = can(StockPermission.ledger);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [lowOnly, setLowOnly] = useListViewState("lowOnly", false);
  const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
    useCommittedSearch({
      persistKey: "search",
      onCommit: () => setCurrentPage(1),
    });
  const [ledgerItem, setLedgerItem] = useState<StockRow | null>(null);

  const params = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      search: omitEmptySearch(committedSearch),
      lowOnly: lowOnly || undefined,
    }),
    [currentPage, committedSearch, lowOnly],
  );

  const { data: listData, isLoading, isError } = useStockList(params);
  useQueryErrorToast(isError, t("loadError"));

  const items = listData?.data ?? [];
  // The API sends cost keys only to an actor holding `purchase_price:read`.
  const showCosts = items.some((row) => "value" in row);
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
          <FormCheckbox
            label={t("lowOnly")}
            checked={lowOnly}
            onChange={(checked) => {
              setLowOnly(checked);
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
                icon={stockFeature.items[0]?.icon ?? "building-warehouse"}
                message={resolveListEmptyMessage(
                  Boolean(committedSearch || lowOnly),
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
            <StockTable
              data={items}
              showCosts={showCosts}
              onOpenLedger={canReadLedger ? setLedgerItem : undefined}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      {ledgerItem && canReadLedger && (
        <StockLedgerDrawer
          item={ledgerItem}
          showCosts={showCosts}
          onClose={() => setLedgerItem(null)}
        />
      )}
    </>
  );
}

export default StockListPage;
