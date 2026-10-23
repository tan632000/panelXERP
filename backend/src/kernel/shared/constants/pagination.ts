/** Default page number for paginated queries. */
export const DEFAULT_PAGE = 1;

/** Default page size for list endpoints. Override in filter DTO only when different. Keep in sync with FE `list-ui.ts` DEFAULT_LIST_PAGE_SIZE. */
export const DEFAULT_LIST_PAGE_SIZE = 25;

/** Default page size for picker/general paginated queries. Keep in sync with FE `list-ui.ts` DEFAULT_PICKER_PAGE_SIZE. */
export const DEFAULT_PICKER_PAGE_SIZE = 20;

/** Max items per API request. Keep in sync with FE `list-ui.ts` MAX_PAGE_SIZE. */
export const MAX_LIMIT = 100;

/**
 * Max ids one bulk delete or approve may carry. A selection holds the rows of one page, and a
 * page holds every line of its documents, so the cap sits well above any real page; it only
 * keeps one request's work bounded. Keep in sync with FE `list-ui.ts` MAX_BULK_DELETE_IDS.
 */
export const MAX_BULK_DELETE_IDS = 2000;
