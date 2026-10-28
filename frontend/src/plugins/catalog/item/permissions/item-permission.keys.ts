/**
 * Item permission keys — keep in sync with backend item.permissions.ts.
 *
 * Gate every item control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const ItemPermission = {
  read: "item:read",
  create: "item:create",
  update: "item:update",
  delete: "item:delete",
  import: "item:import",
  stockSettings: "item:stock_settings",
  /** Not an item scope: it gates the `referencePrice` the API returns. */
  referencePriceRead: "reference_price:read",
} as const;

export type ItemPermissionKey =
  (typeof ItemPermission)[keyof typeof ItemPermission];
