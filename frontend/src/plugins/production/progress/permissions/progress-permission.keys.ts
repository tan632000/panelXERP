/**
 * Production progress permission keys — keep in sync with backend progress.permissions.ts.
 *
 * Gate every stage control on one of these instead of a literal string, so a scope rename shows
 * up as a type error rather than a control that silently stops matching.
 */
export const ProductionProgressPermission = {
  read: "production_progress:read",
  update: "production_progress:update",
  undo: "production_progress:undo",
} as const;
