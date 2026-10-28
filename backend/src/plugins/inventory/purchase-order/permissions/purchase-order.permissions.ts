export const PURCHASE_ORDER_READ = 'purchase_order:read' as const;
export const PURCHASE_ORDER_CREATE = 'purchase_order:create' as const;
/** Edit a draft's header and lines. */
export const PURCHASE_ORDER_UPDATE = 'purchase_order:update' as const;
export const PURCHASE_ORDER_SUBMIT = 'purchase_order:submit' as const;
/** Approve or reject a submitted order. */
export const PURCHASE_ORDER_APPROVE = 'purchase_order:approve' as const;
export const PURCHASE_ORDER_CANCEL = 'purchase_order:cancel' as const;
/** Short-close an approved or partly received order. */
export const PURCHASE_ORDER_CLOSE = 'purchase_order:close' as const;

export const purchaseOrderPermissions = [
  PURCHASE_ORDER_READ,
  PURCHASE_ORDER_CREATE,
  PURCHASE_ORDER_UPDATE,
  PURCHASE_ORDER_SUBMIT,
  PURCHASE_ORDER_APPROVE,
  PURCHASE_ORDER_CANCEL,
  PURCHASE_ORDER_CLOSE,
] as const;
