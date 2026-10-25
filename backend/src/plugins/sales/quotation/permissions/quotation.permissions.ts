export const QUOTATION_READ = 'quotation:read' as const;
export const QUOTATION_CREATE = 'quotation:create' as const;
export const QUOTATION_UPDATE = 'quotation:update' as const;

export const quotationPermissions = [
  QUOTATION_READ,
  QUOTATION_CREATE,
  QUOTATION_UPDATE,
] as const;
