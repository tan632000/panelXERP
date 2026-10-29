export const STOCK_RECEIPT_TABLE = 'stock_receipts';
export const STOCK_RECEIPT_CODE_PREFIX = 'NK';
export const STOCK_RECEIPT_CODE_INDEX = 'uq_stock_receipts_code';
export const STOCK_RECEIPT_REQUEST_KEY_INDEX = 'uq_stock_receipts_request_key';
export const STOCK_RECEIPT_LABEL = 'Stock receipt';
/** The document kind its stock movements carry. */
export const STOCK_RECEIPT_DOCUMENT_TYPE = 'stock_receipt';
/** Lines one receipt may hold: never more than the purchase order's. */
export const STOCK_RECEIPT_MAX_LINES = 500;
