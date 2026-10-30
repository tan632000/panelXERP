"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
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
import { cn } from "@/kernel/core/lib/cn";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";
import {
  omitEmptySearch,
  resolveListEmptyMessage,
} from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import { stocktakePageRoutes } from "@plugins/inventory/stocktake/constants";
import {
  useCreateStocktake,
  useLocations,
  useStocktakeList,
} from "@plugins/inventory/stocktake/hooks/api/useStocktake";
import { StocktakePermission } from "@plugins/inventory/stocktake/permissions/stocktake-permission.keys";
import { stocktakeFeature } from "@plugins/inventory/stocktake/stocktake.feature";

import type { StocktakeRow } from "@plugins/inventory/stocktake/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** Counts so far, and a new count of the whole warehouse or one location. */
export function StocktakeListPage() {
  const t = useTranslations("stocktake");
  const { can } = useAuth();
  const router = useRouter();
  const canCreate = can(StocktakePermission.create);
  const [scope, setScope] = useState<"all" | "location">("all");
  const [locationId, setLocationId] = useState("");
  const locations = useLocations(canCreate && scope === "location");
  const create = useCreateStocktake();

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
  const { data: listData, isLoading, isError } = useStocktakeList(params);
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

  const columns: Array<TableColumn<StocktakeRow>> = [
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
      key: "scope",
      ...PLAIN,
      header: t("scope"),
      render: (_, row) =>
        row.scope === "all"
          ? t("scopeAll")
          : t("scopeLocation", { code: row.locationCode ?? "" }),
    },
    {
      key: "status",
      ...PLAIN,
      header: t("status"),
      render: (_, row) => t(`statuses.${row.status}`),
    },
    {
      key: "countedCount",
      ...PLAIN,
      header: t("progress"),
      render: (_, row) =>
        t("progressValue", { counted: row.countedCount, total: row.lineCount }),
    },
    {
      key: "createdAt",
      ...PLAIN,
      header: t("createdAt"),
      render: (_, row) => formatIsoDateTime(row.createdAt),
    },
  ];

  const startBlocked =
    create.isPending || (scope === "location" && locationId === "");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {/* Inside the list layout, above its body: the page gutter applies and only the table scrolls. */}
      <ListPageLayout>
        {canCreate ? (
          <DetailSection title={t("create.title")}>
            <div className="flex flex-wrap items-end gap-3">
              <div role="group" aria-label={t("scope")} className="flex gap-2">
                {(["all", "location"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      scope === value
                        ? "border-brand bg-brand text-white"
                        : "border-border-secondary text-text-primary",
                    )}
                    onClick={() => setScope(value)}
                  >
                    {value === "all" ? t("scopeAll") : t("create.oneLocation")}
                  </button>
                ))}
              </div>
              {scope === "location" ? (
                <select
                  aria-label={t("create.location")}
                  className="h-9 rounded-[7px] border border-border-secondary bg-surface-primary px-2 text-sm"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  <option value="">{t("create.pickLocation")}</option>
                  {(locations.data ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {`${location.code} — ${location.name}`}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button
                type="button"
                disabled={startBlocked}
                onClick={() =>
                  create.mutate(
                    scope === "all"
                      ? { scope }
                      : { scope, locationId: Number(locationId) },
                    {
                      onSuccess: (detail) =>
                        router.push(stocktakePageRoutes.detail(detail.id)),
                    },
                  )
                }
              >
                {t("create.submit")}
              </Button>
            </div>
          </DetailSection>
        ) : null}

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
                icon={stocktakeFeature.items[0]?.icon ?? "clipboard-list"}
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
                router.push(stocktakePageRoutes.detail(row.id))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
