"use client";

import { useEffect } from "react";

interface UseFollowLastPageOptions {
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Follows the list back when it shrinks past the page being viewed.
 *
 * Deleting the last rows of page 2 leaves the query asking for a page that no longer exists,
 * which answers with nothing: the screen would read as an empty list while page 1 still holds
 * rows, and a single-page result hides the pager that could take the reader back. The same
 * happens when a list re-opens on the page a reader left it at and the data has shrunk since.
 */
export function useFollowLastPage({
  isLoading,
  currentPage,
  totalPages,
  onPageChange,
}: UseFollowLastPageOptions): void {
  useEffect(() => {
    if (isLoading || currentPage <= totalPages) return;
    onPageChange(totalPages);
  }, [isLoading, currentPage, totalPages, onPageChange]);
}
