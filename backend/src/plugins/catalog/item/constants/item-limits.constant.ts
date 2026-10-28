/**
 * Largest reference price the API accepts. Small enough that cents (value * 100) stay below
 * 2^53, so the two-decimal checks are exact in a JS number, and far inside `numeric(18,2)`.
 */
export const ITEM_REFERENCE_PRICE_MAX = 90_000_000_000_000;

/** Largest minimum stock the API accepts: thousandths stay below 2^53 and inside `numeric(18,3)`. */
export const ITEM_MIN_STOCK_MAX = 9_000_000_000_000;

/** Most labels one print request may carry (ids x copies): a roll, not a print run. */
export const ITEM_LABELS_MAX = 500;
