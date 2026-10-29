export const PURCHASE_REQUEST_TABLE = 'purchase_requests';
export const PURCHASE_REQUEST_CODE_PREFIX = 'PR';
export const PURCHASE_REQUEST_CODE_INDEX = 'uq_purchase_requests_code';
export const PURCHASE_REQUEST_LABEL = 'Purchase request';
/** Lines one request may hold. */
export const PURCHASE_REQUEST_MAX_LINES = 500;

/**
 * First key of the per-order advisory lock a request from an order's shortage takes (D-04): two
 * requests for one order then read each other's lines instead of both requesting the shortage.
 */
export const PURCHASE_REQUEST_ORDER_LOCK = 7_420_015;

/** Name the request registers under at the catalog's item delete veto. */
export const PURCHASE_REQUEST_REFERENCE_CHECK = 'inventory-purchase-request';
