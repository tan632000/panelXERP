/**
 * Quotation permission keys — keep in sync with backend quotation.permissions.ts.
 *
 * Gate every quotation control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const QuotationPermission = {
  read: "quotation:read",
  create: "quotation:create",
  update: "quotation:update",
  submit: "quotation:submit",
  approve: "quotation:approve",
  confirm: "quotation:confirm",
  cancel: "quotation:cancel",
  export: "quotation:export",
} as const;

export type QuotationPermissionKey =
  (typeof QuotationPermission)[keyof typeof QuotationPermission];
