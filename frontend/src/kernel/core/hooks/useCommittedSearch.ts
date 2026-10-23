"use client";

import { useCallback, useState, type KeyboardEvent } from "react";

import { useListViewState } from "@/kernel/core/hooks/useListViewState";

interface UseCommittedSearchOptions {
  onCommit?: () => void;
  /**
   * Names this keyword within its list, which keeps it alive while the reader steps into a
   * record and back. Only the committed keyword is kept — an uncommitted draft is not a filter.
   */
  persistKey?: string;
  /** See {@link useListViewScope} — shares this keyword across a screen's route-split tabs. */
  scope?: string;
}

/** List-page search: draft input vs keyword committed on Enter. */
export function useCommittedSearch(options: UseCommittedSearchOptions = {}) {
  const { onCommit, persistKey, scope } = options;
  const [committedSearch, setCommittedSearch] = useListViewState(
    persistKey,
    "",
    { scope },
  );
  const [searchQuery, setDraftSearch] = useState(committedSearch);

  const commitSearch = useCallback(() => {
    setCommittedSearch(searchQuery.trim());
    onCommit?.();
  }, [onCommit, searchQuery, setCommittedSearch]);

  /**
   * Emptying the box commits on its own: clearing a keyword is the reader asking for the
   * unfiltered list back, and waiting for Enter would leave the list filtered by a keyword
   * that is no longer on screen.
   */
  const setSearchQuery = useCallback(
    (value: string) => {
      setDraftSearch(value);
      if (value.trim() === "") {
        setCommittedSearch("");
        onCommit?.();
      }
    },
    [onCommit, setCommittedSearch],
  );

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitSearch();
      }
    },
    [commitSearch],
  );

  return {
    searchQuery,
    setSearchQuery,
    committedSearch,
    setCommittedSearch,
    commitSearch,
    handleSearchKeyDown,
  };
}
