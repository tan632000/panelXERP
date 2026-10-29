export const SUPPLIER_RETURN_TABLE = 'stock_supplier_returns';
export const SUPPLIER_RETURN_CODE_PREFIX = 'XT';
export const SUPPLIER_RETURN_CODE_INDEX = 'uq_stock_supplier_returns_code';
export const SUPPLIER_RETURN_REQUEST_KEY_INDEX =
  'uq_stock_supplier_returns_request_key';
export const SUPPLIER_RETURN_LABEL = 'Supplier return';
/** The document kind its stock movements carry. */
export const SUPPLIER_RETURN_DOCUMENT_TYPE = 'stock_supplier_return';
/** Lines one return may hold: never more than the purchase order's. */
export const SUPPLIER_RETURN_MAX_LINES = 500;
