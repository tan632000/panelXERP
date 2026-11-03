/**
 * The order statuses each inventory screen acts on, mirroring the backend lists: an order in
 * production keeps its demand, its issuing and its returns, like an open one.
 */
export const DEMAND_BEARING_ORDER_STATUSES: readonly string[] = [
  "open",
  "in_production",
];

/** Orders stock is issued to. */
export const ISSUABLE_ORDER_STATUSES: readonly string[] = [
  "open",
  "in_production",
];

/** Orders the workshop may return stock from: a cancelled order's leftovers too. */
export const RETURNABLE_ORDER_STATUSES: readonly string[] = [
  "open",
  "in_production",
  "cancelled",
];

export const isIssuableOrder = (status: string) =>
  ISSUABLE_ORDER_STATUSES.includes(status);

export const isReturnableOrder = (status: string) =>
  RETURNABLE_ORDER_STATUSES.includes(status);

export const isDemandBearingOrder = (status: string) =>
  DEMAND_BEARING_ORDER_STATUSES.includes(status);
