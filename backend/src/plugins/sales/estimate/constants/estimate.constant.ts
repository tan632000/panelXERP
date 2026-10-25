/** Document code prefix — codes read `DT_2027_0001`. */
export const ESTIMATE_CODE_PREFIX = 'DT';

/** Physical table and the unique index over its code, named for the retry on a lost race. */
export const ESTIMATE_TABLE = 'sales_estimates';
export const ESTIMATE_CODE_UNIQUE_INDEX = 'uq_sales_estimates_code';

/** Notification raised for the sales owner when a revision is submitted. */
export const ESTIMATE_SUBMITTED_EVENT = 'sales.estimate.submitted';

/** Name the estimate registers under at the item delete check. */
export const ESTIMATE_ITEM_REFERENCE_CHECK = 'estimate';

/**
 * Largest amount any stored figure may reach (VND). It stays below 2^53, so the numbers the
 * API returns are exact, and far below what `numeric(18,2)` holds.
 */
export const MAX_ESTIMATE_AMOUNT = 1_000_000_000_000_000;

/** Bounds of what one request may enter; the amount cap catches the products of them. */
export const MAX_PANEL_QUANTITY = 10_000;
export const MAX_BOM_QUANTITY = 1_000_000;
export const MAX_UNIT_COST = 10_000_000_000;
export const MAX_COST_LINE_AMOUNT = 1_000_000_000_000;

export const MAX_TAG_LENGTH = 50;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_NOTE_LENGTH = 500;
