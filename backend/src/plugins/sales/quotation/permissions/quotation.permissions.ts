export const QUOTATION_READ = 'quotation:read' as const;
export const QUOTATION_CREATE = 'quotation:create' as const;
export const QUOTATION_UPDATE = 'quotation:update' as const;
export const QUOTATION_SUBMIT = 'quotation:submit' as const;
export const QUOTATION_APPROVE = 'quotation:approve' as const;
export const QUOTATION_CONFIRM = 'quotation:confirm' as const;
export const QUOTATION_CANCEL = 'quotation:cancel' as const;
export const QUOTATION_EXPORT = 'quotation:export' as const;

export const quotationPermissions = [
  QUOTATION_READ,
  QUOTATION_CREATE,
  QUOTATION_UPDATE,
  QUOTATION_SUBMIT,
  QUOTATION_APPROVE,
  QUOTATION_CONFIRM,
  QUOTATION_CANCEL,
  QUOTATION_EXPORT,
] as const;
