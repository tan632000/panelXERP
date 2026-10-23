/**
 * Fallback roles that fill the invoice fields (number, date, template, series) on a document
 * that has no `<res>:invoice:write` scope yet (the purchase delivery note). Warehouse receipts
 * are decided by their own scope — see `UpdateLineInvoicesOptions.permission`. Checked against
 * `AuthUserPayload.role` (the `seed-roles.ts` role keys).
 */
export const INVOICE_EDIT_ROLES = [
  'director',
  'purchase_manager',
  'purchase_staff',
] as const;

export function canEditLineInvoices(
  role: string | undefined,
  roles: readonly string[] = INVOICE_EDIT_ROLES,
): boolean {
  return !!role && roles.includes(role);
}
