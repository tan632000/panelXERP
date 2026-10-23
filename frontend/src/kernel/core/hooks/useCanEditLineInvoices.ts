"use client";

import { useAuth } from "@/kernel/core/auth/AuthContext";

/**
 * Fallback roles for a document that has no `<res>:invoice:write` scope yet (the purchase
 * delivery note). Mirrors the backend's `INVOICE_EDIT_ROLES`; the server refuses every other role.
 */
export const INVOICE_EDIT_ROLES = [
  "director",
  "purchase_manager",
  "purchase_staff",
] as const;

export function canEditLineInvoices(
  role: string | undefined,
  roles: readonly string[] = INVOICE_EDIT_ROLES,
): boolean {
  return !!role && roles.includes(role);
}

/**
 * Whether the signed-in user may update a document's invoice fields. A document with its own
 * `<res>:invoice:write` scope passes it as `permission` and the permission matrix decides; the
 * rest keep the role list (`roles`, defaulting to the shared one).
 */
export function useCanEditLineInvoices(
  roles: readonly string[] = INVOICE_EDIT_ROLES,
  permission?: string,
): boolean {
  const { user, can } = useAuth();
  return permission ? can(permission) : canEditLineInvoices(user?.role, roles);
}
