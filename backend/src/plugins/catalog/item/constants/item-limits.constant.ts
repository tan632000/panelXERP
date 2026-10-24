/**
 * Largest reference price the API accepts. Small enough that cents (value * 100) stay below
 * 2^53, so the two-decimal checks are exact in a JS number, and far inside `numeric(18,2)`.
 */
export const ITEM_REFERENCE_PRICE_MAX = 90_000_000_000_000;
