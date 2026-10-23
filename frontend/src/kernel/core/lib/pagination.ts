export interface PaginationMetaInput {
  page: number;
  pageSize: number;
  totalItems: number;
  currentPageItemCount: number;
  totalPages?: number;
}

export interface PaginationMeta {
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

export function computePaginationMeta(
  input: PaginationMetaInput,
): PaginationMeta {
  const { page, pageSize, totalItems, currentPageItemCount } = input;
  const totalPages =
    input.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + currentPageItemCount, totalItems);

  return { totalItems, totalPages, startIndex, endIndex };
}

/** A gap standing for the pages a shortened pager leaves out. */
export const PAGE_GAP = "gap" as const;

export type PaginationItem = number | typeof PAGE_GAP;

/**
 * How many numbered buttons a pager shows at most: first, last, the current page with one
 * neighbour on each side, and the two gaps between those groups.
 */
const MAX_PAGE_SLOTS = 7;

/**
 * The pages a pager draws, with `PAGE_GAP` where it skips a stretch of them.
 *
 * A list of a few hundred pages rendered one button each is wider than the screen, so past
 * `MAX_PAGE_SLOTS` the run collapses around the current page. The first and last page always
 * stay reachable, since they are the two a reader jumps to by name.
 */
export function buildPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  if (totalPages <= MAX_PAGE_SLOTS) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const page = Math.min(Math.max(currentPage, 1), totalPages);
  // Both ends run five numbers before the gap, so the pager keeps one width as it moves.
  const nearStart = page <= 4;
  const nearEnd = page >= totalPages - 3;

  if (nearStart) {
    return [1, 2, 3, 4, 5, PAGE_GAP, totalPages];
  }
  if (nearEnd) {
    return [
      1,
      PAGE_GAP,
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, PAGE_GAP, page - 1, page, page + 1, PAGE_GAP, totalPages];
}
