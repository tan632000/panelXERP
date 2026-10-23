"use client";

import { useAuth } from "@/kernel/core/auth/AuthContext";

import type { ReactNode } from "react";

export type PermissionAction = "view" | "create" | "edit" | "delete";
export type PermissionLevel = "module" | "page" | "action";

interface PermissionGateProps {
  /** Permission string: "resource:action" (e.g. "sales:view") */
  permission?: string;
  /**
   * Several scopes, any one of which opens the gate.
   *
   * For a control one scope does not describe: a record two departments edit through
   * different scopes, or an approval split into per-step scopes. Nesting two gates would
   * render the control twice, and a single scope would hide it from half the actors entitled
   * to it.
   */
  anyOf?: readonly string[];
  /** Module key for module-level access (e.g. "sales") — used directly as resource key */
  module?: string;
  action?: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  anyOf,
  module,
  action = "view",
  children,
  fallback = null,
}: PermissionGateProps) {
  const { can, permissions } = useAuth();

  if (!permission && !anyOf?.length && !module) return <>{children}</>;

  if (permission) {
    if (!can(permission)) return <>{fallback}</>;
    return <>{children}</>;
  }

  if (anyOf?.length) {
    if (!anyOf.some((scope) => can(scope))) return <>{fallback}</>;
    return <>{children}</>;
  }

  if (module) {
    const modulePermission = `${module}:${action}`;
    const hasModuleAccess = permissions.some(
      (p) =>
        p === `${module}:*` ||
        p === modulePermission ||
        p === `*:${action}` ||
        p === "*:*",
    );

    if (!hasModuleAccess) return <>{fallback}</>;
    return <>{children}</>;
  }

  return <>{children}</>;
}
