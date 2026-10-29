export const STOCKTAKE_READ = 'stocktake:read' as const;
/** Open a count of the whole warehouse or one location. */
export const STOCKTAKE_CREATE = 'stocktake:create' as const;
/** Scan and set counted quantities while the count is open. */
export const STOCKTAKE_UPDATE = 'stocktake:update' as const;
export const STOCKTAKE_SUBMIT = 'stocktake:submit' as const;
/** Approve or reject a submitted count; approval posts the differences. */
export const STOCKTAKE_APPROVE = 'stocktake:approve' as const;
export const STOCKTAKE_CANCEL = 'stocktake:cancel' as const;

export const stocktakePermissions = [
  STOCKTAKE_READ,
  STOCKTAKE_CREATE,
  STOCKTAKE_UPDATE,
  STOCKTAKE_SUBMIT,
  STOCKTAKE_APPROVE,
  STOCKTAKE_CANCEL,
] as const;
