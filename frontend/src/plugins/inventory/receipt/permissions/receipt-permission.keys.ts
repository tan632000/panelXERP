/**
 * Stock receipt permission keys — keep in sync with backend receipt.permissions.ts.
 *
 * Gate every receipt control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const ReceiptPermission = {
  read: "stock_receipt:read",
  create: "stock_receipt:create",
} as const;

export type ReceiptPermissionKey =
  (typeof ReceiptPermission)[keyof typeof ReceiptPermission];
