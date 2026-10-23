"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import api from "@/kernel/core/api/api";
import {
  COLUMN_VALUES_PAGE_SIZE,
  DEFAULT_LIST_STALE_MS,
  MAX_PAGE_SIZE,
} from "@/kernel/core/constants/list-ui";
import { queryKeys } from "@/kernel/core/constants/queryKeys";
import { useDebouncedValue } from "@/kernel/core/hooks/useDebouncedValue";
import {
  serializeColumnFilters,
  toStoredValueSearch,
  withColumnSelection,
} from "@/kernel/core/lib/table-column-filter";

import type {
  ColumnValuesParams,
  TableColumnFilterSelections,
} from "@/kernel/core/types/column-filter";
import type { PaginatedResponse } from "@/kernel/core/types/common";

interface UseColumnFilterValuesOptions {
  endpoint?: string;
  column: string;
  /** Kept false while the filter is closed, so no list pays for filters nobody opened. */
  enabled: boolean;
  /**
   * Extra static query params the endpoint needs to scope its whole-table value list, e.g.
   * the active tab — so a value belonging only to the other tab's rows never appears here.
   */
  extraParams?: Record<string, string | undefined>;
  /**
   * Every column selection the table holds. The values offered are those of the rows the
   * other selections leave, the way an Excel filter narrows step by step; the column's own
   * selection is left out so its unselected values stay pickable.
   */
  columnFilters?: TableColumnFilterSelections;
  /**
   * False when the column shows a label rather than its stored value — an enum, a catalog
   * code, a formatted number. The server can only match the stored text, so the search is
   * left to the caller, which matches it against the label instead. Such a search has to
   * see every value, so the pages are fetched at the largest size the API allows.
   */
  searchOnServer?: boolean;
}

export interface ColumnFilterValues {
  values: string[];
  search: string;
  setSearch: (value: string) => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  isError: boolean;
}

/**
 * One column's filter values, read from the whole table rather than the page the client
 * holds, so a column filter can offer every value. Pages load one at a time, on demand.
 */
export function useColumnFilterValues({
  endpoint,
  column,
  enabled,
  extraParams,
  columnFilters,
  searchOnServer = true,
}: UseColumnFilterValuesOptions): ColumnFilterValues {
  const [search, setSearch] = useState("");
  const debouncedInput = useDebouncedValue(search);
  // A labelled column still hands the server a date or number typed as the cell reads it,
  // rewritten to the stored form; any other text is matched by the caller against labels.
  const debouncedSearch = searchOnServer
    ? debouncedInput
    : (toStoredValueSearch(debouncedInput) ?? "");
  const isEnabled = enabled && Boolean(endpoint);
  const otherFilters = columnFilters
    ? serializeColumnFilters(withColumnSelection(columnFilters, column, []))
    : undefined;
  const scopeParams =
    extraParams || otherFilters
      ? { ...extraParams, columnFilters: otherFilters }
      : undefined;
  const scope = scopeParams ? JSON.stringify(scopeParams) : undefined;

  const query = useInfiniteQuery({
    queryKey: queryKeys.columnValues(
      endpoint ?? "",
      column,
      debouncedSearch,
      scope,
    ),
    queryFn: async ({ pageParam }) => {
      const params: ColumnValuesParams = {
        ...scopeParams,
        column,
        search: debouncedSearch.trim() || undefined,
        page: pageParam,
        limit: searchOnServer ? COLUMN_VALUES_PAGE_SIZE : MAX_PAGE_SIZE,
      };
      const { data } = await api.get<PaginatedResponse<string>>(
        endpoint as string,
        { params },
      );
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    enabled: isEnabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });

  const values = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  return {
    values,
    search,
    setSearch,
    isLoading: query.isPending && isEnabled,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    isError: query.isError,
  };
}
