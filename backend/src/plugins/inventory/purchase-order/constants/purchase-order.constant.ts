export const PURCHASE_ORDER_TABLE = 'purchase_orders';
export const PURCHASE_ORDER_CODE_PREFIX = 'PO';
export const PURCHASE_ORDER_CODE_INDEX = 'uq_purchase_orders_code';
export const PURCHASE_ORDER_LABEL = 'Purchase order';

/** VAT rates a purchase order may carry, in percent. */
export const PURCHASE_ORDER_VAT_RATES = [0, 5, 8, 10] as const;
/** Lines one order may hold. */
export const PURCHASE_ORDER_MAX_LINES = 500;

/** The role told when an order waits for approval. */
export const PURCHASE_ORDER_APPROVER_ROLE_CODES = ['director'] as const;

export const PURCHASE_ORDER_SUBMITTED_EVENT =
  'inventory.purchase_order.submitted';
export const PURCHASE_ORDER_APPROVED_EVENT =
  'inventory.purchase_order.approved';
export const PURCHASE_ORDER_REJECTED_EVENT =
  'inventory.purchase_order.rejected';

/** Name the order registers under at the supplier and item delete vetoes. */
export const PURCHASE_ORDER_REFERENCE_CHECK = 'inventory-purchase-order';
