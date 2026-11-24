/**
 * Quotation template permission keys — keep in sync with backend quotation-template.permissions.ts.
 *
 * Gate every template control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const TemplatePermission = {
  read: "quotation_template:read",
  create: "quotation_template:create",
  update: "quotation_template:update",
  delete: "quotation_template:delete",
} as const;

export type TemplatePermissionKey =
  (typeof TemplatePermission)[keyof typeof TemplatePermission];
