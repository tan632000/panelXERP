export const QUOTATION_TEMPLATE_READ = 'quotation_template:read' as const;
export const QUOTATION_TEMPLATE_CREATE = 'quotation_template:create' as const;
export const QUOTATION_TEMPLATE_UPDATE = 'quotation_template:update' as const;
export const QUOTATION_TEMPLATE_DELETE = 'quotation_template:delete' as const;

export const quotationTemplatePermissions = [
  QUOTATION_TEMPLATE_READ,
  QUOTATION_TEMPLATE_CREATE,
  QUOTATION_TEMPLATE_UPDATE,
  QUOTATION_TEMPLATE_DELETE,
] as const;
