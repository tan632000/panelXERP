export const STOCK_ISSUE_TABLE = 'stock_issues';
export const STOCK_ISSUE_CODE_PREFIX = 'XK';
export const STOCK_ISSUE_CODE_INDEX = 'uq_stock_issues_code';
export const STOCK_ISSUE_REQUEST_KEY_INDEX = 'uq_stock_issues_request_key';
export const STOCK_ISSUE_LABEL = 'Stock issue';
/** The document kind its stock movements carry. */
export const STOCK_ISSUE_DOCUMENT_TYPE = 'stock_issue';

export const WORKSHOP_RETURN_TABLE = 'stock_workshop_returns';
export const WORKSHOP_RETURN_CODE_PREFIX = 'NT';
export const WORKSHOP_RETURN_CODE_INDEX = 'uq_stock_workshop_returns_code';
export const WORKSHOP_RETURN_REQUEST_KEY_INDEX =
  'uq_stock_workshop_returns_request_key';
export const WORKSHOP_RETURN_LABEL = 'Workshop return';
export const WORKSHOP_RETURN_DOCUMENT_TYPE = 'stock_workshop_return';

/** Lines one document may hold. */
export const STOCK_ISSUE_MAX_LINES = 500;

/** Orders stock is issued to (user, Q7). */
export const ISSUABLE_ORDER_STATUSES: readonly string[] = [
  'open',
  'in_production',
];
/** Orders the workshop may return stock from (user, Q7): a cancelled order's leftovers too. */
export const RETURNABLE_ORDER_STATUSES: readonly string[] = [
  'open',
  'in_production',
  'cancelled',
];
