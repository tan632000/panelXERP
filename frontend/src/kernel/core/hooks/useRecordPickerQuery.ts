"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import {
  DEFAULT_PICKER_PAGE_SIZE,
  DEFAULT_PICKER_STALE_MS,
  DEFAULT_SEARCH_DEBOUNCE_MS,
} from "@/kernel/core/constants/list-ui";
import { useDebouncedValue } from "@/kernel/core/hooks/useDebouncedValue";
import { omitEmptySearch } from "@/kernel/core/lib/list-params";

import type { PaginatedResponse } from "@/kernel/core/types/common";

export interface RecordPickerPageParams {
  page: number;
  limit: number;
  search?: string;
  /**
   * Comma-separated enum values whose translated label matched the keyword. Sent alongside
   * `search` to widen it, because a classification column stores an English enum.
   */
  searchClassifications?: string;
}

interface UseRecordPickerQueryConfig<T> {
  /** Raw keyword from the popup search box; debounced here. */
  search: string;
  /** Keeps the request idle until the popup that needs it is open. */
  enabled?: boolean;
  queryKey: (search: string) => readonly unknown[];
  fetchPage: (params: RecordPickerPageParams) => Promise<PaginatedResponse<T>>;
  /** Resolves a keyword to classification enum values; see `useClassificationOptions`. */
  matchClassifications?: (keyword: string) => string[];
}

/**
 * The paged records behind a search popup.
 *
 * One implementation for every reference list: a module supplies its query key and page
 * fetcher, and gets back the flattened records plus the paging state the popup scrolls on.
 */
export function useRecordPickerQuery<T>({
  search,
  enabled = true,
  queryKey,
  fetchPage,
  matchClassifications,
}: UseRecordPickerQueryConfig<T>) {
  const debouncedSearch = useDebouncedValue(search, {
    delay: DEFAULT_SEARCH_DEBOUNCE_MS,
  });

  // Derived from the same keyword the query is keyed on, so the cache stays correct.
  const searchClassifications = useMemo(() => {
    const matched = matchClassifications?.(debouncedSearch) ?? [];
    return matched.length > 0 ? matched.join(",") : undefined;
  }, [debouncedSearch, matchClassifications]);

  const query = useInfiniteQuery({
    queryKey: queryKey(debouncedSearch),
    queryFn: ({ pageParam }) =>
      fetchPage({
        page: pageParam,
        limit: DEFAULT_PICKER_PAGE_SIZE,
        search: omitEmptySearch(debouncedSearch),
        searchClassifications,
      }),
    initialPageParam: 1,
    enabled,
    staleTime: DEFAULT_PICKER_STALE_MS,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const records = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  return {
    records,
    // Only the first load blanks the table; a next-page fetch keeps what is already listed.
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore,
  };
}
