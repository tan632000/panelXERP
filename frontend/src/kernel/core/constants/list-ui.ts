/** Default page size for paginated list pages. Import directly; define a local constant only when overriding. */
export const DEFAULT_LIST_PAGE_SIZE = 25;

/** One list table row: `py-2.5` on both sides, a 13px line, and the row border. */
export const LIST_ROW_HEIGHT_PX = 41;

/**
 * Height the loading and empty states reserve.
 *
 * A full page of rows, so the card is the size the reader already associates with this list
 * rather than a strip or the whole viewport, and nothing shifts once the rows arrive.
 */
export const LIST_STATE_MIN_HEIGHT_PX =
  DEFAULT_LIST_PAGE_SIZE * LIST_ROW_HEIGHT_PX;

/** Default page size for async picker infinite scroll. Import directly; define a local constant only when overriding. */
export const DEFAULT_PICKER_PAGE_SIZE = 20;

/** Page size of a table column filter's value list; the next page loads on demand. */
export const COLUMN_VALUES_PAGE_SIZE = 20;

/** Max items per API request — aligned with backend `@shared/constants/pagination` MAX_LIMIT. */
export const MAX_PAGE_SIZE = 100;

/**
 * Max rows one bulk delete or approve may carry. A selection holds one page, every line of its
 * documents, so the cap sits well above any real page — aligned with backend
 * `MAX_BULK_DELETE_IDS`.
 */
export const MAX_BULK_DELETE_IDS = 2000;

// TanStack Query constants

/** Debounce delay (ms) for list search/filter inputs. */
export const DEFAULT_FILTER_DEBOUNCE_MS = 300;

/** Debounce delay (ms) for async dropdown/picker search. */
export const DEFAULT_SEARCH_DEBOUNCE_MS = 300;

/** Default TanStack Query staleTime (ms) for paginated list queries. Import directly; define locally only when overriding. */
export const DEFAULT_LIST_STALE_MS = 30_000;

/** Default TanStack Query staleTime (ms) for async picker/dropdown queries. Import directly; define locally only when overriding. */
export const DEFAULT_PICKER_STALE_MS = 30_000;

/** Default TanStack Query staleTime (ms) for reference/lookup data (countries, industries). */
export const DEFAULT_REFERENCE_DATA_STALE_MS = 24 * 60 * 60 * 1000;

/** Default TanStack QueryClient staleTime (ms) — global fallback when hook does not override. */
export const DEFAULT_QUERY_CLIENT_STALE_MS = 60_000;

/** Default TanStack Query retry count for failed queries. */
export const DEFAULT_QUERY_RETRY = 1;

/** Retries for a read the server throttled (429); each waits out the block it names. */
export const RATE_LIMITED_QUERY_RETRY = 3;

/** Longest wait before retrying a throttled read — the server's whole rate window. */
export const RATE_LIMIT_MAX_RETRY_DELAY_MS = 60_000;
