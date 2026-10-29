export const PURCHASE_REQUEST_READ = 'purchase_request:read' as const;
/** Raise a request by hand or from an order's shortage. */
export const PURCHASE_REQUEST_CREATE = 'purchase_request:create' as const;
/** Edit a request nothing has been ordered on yet. */
export const PURCHASE_REQUEST_UPDATE = 'purchase_request:update' as const;
export const PURCHASE_REQUEST_CANCEL = 'purchase_request:cancel' as const;

export const purchaseRequestPermissions = [
  PURCHASE_REQUEST_READ,
  PURCHASE_REQUEST_CREATE,
  PURCHASE_REQUEST_UPDATE,
  PURCHASE_REQUEST_CANCEL,
] as const;
