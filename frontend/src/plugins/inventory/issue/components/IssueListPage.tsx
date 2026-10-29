"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { ScanInput } from "@/kernel/core/components/ui/ScanInput";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import { issuePageRoutes } from "@plugins/inventory/issue/constants";
import { useIssueList } from "@plugins/inventory/issue/hooks/api/useIssue";
import { issueFeature } from "@plugins/inventory/issue/issue.feature";
import { IssuePermission } from "@plugins/inventory/issue/permissions/issue-permission.keys";
import { materialPageRoutes } from "@plugins/inventory/material/constants";
import { getMaterialOrders } from "@plugins/inventory/material/services/material.service";

import type { OrderStockDocumentRow } from "@plugins/inventory/issue/types";

const PLAIN = { filterable: false, sortable: false } as const;

class OrderCodeNotFound extends Error {}

/** The order a typed or scanned order code names, compared exactly, case aside. */
async function findOrderId(code: string): Promise<number> {
  const page = await getMaterialOrders({ search: code, limit: 20 });
  const match = page.data.find(
    (order) => order.code.toLowerCase() === code.toLowerCase(),
  );
  if (!match) throw new OrderCodeNotFound(code);
  return match.id;
}

/** Issues posted so far; an issue starts from its order, by its code or its material page. */
export function IssueListPage() {
  const t = useTranslations("issue");
  const { can } = useAuth();
  const router = useRouter();
  const canIssue = can(IssuePermission.create);

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
  const { data: listData, isLoading, isError } = useIssueList(params);
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

  const columns: Array<TableColumn<OrderStockDocumentRow>> = [
    {
      key: "code",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("code"),
      render: (_, row) => (
        <span className="font-mono font-semibold text-text-primary">
          {row.code}
        </span>
      ),
    },
    {
      key: "orderCode",
      ...PLAIN,
      header: t("order"),
      render: (_, row) => (
        <span className="font-mono">{row.orderCode ?? t("emptyValue")}</span>
      ),
    },
    {
      key: "customerName",
      ...PLAIN,
      header: t("customer"),
      render: (_, row) => row.customerName ?? t("emptyValue"),
    },
    { key: "lineCount", ...PLAIN, header: t("lineCount") },
    {
      key: "createdByName",
      ...PLAIN,
      header: t("createdBy"),
      render: (_, row) => row.createdByName ?? t("emptyValue"),
    },
    {
      key: "createdAt",
      ...PLAIN,
      header: t("createdAt"),
      render: (_, row) => formatIsoDateTime(row.createdAt),
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
          {canIssue ? (
            <ScanInput
              resolve={findOrderId}
              onResult={(orderId) => router.push(issuePageRoutes.issue(orderId))}
              errorMessage={(error) =>
                error instanceof OrderCodeNotFound
                  ? t("orderCode.notFound")
                  : t("scan.failed")
              }
              placeholder={t("orderCode.placeholder")}
            />
          ) : null}
        </ListToolbar>

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon={issueFeature.items[0]?.icon ?? "package-export"}
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
            <Table
              columns={columns}
              data={items}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) =>
                router.push(materialPageRoutes.order(row.orderId))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
