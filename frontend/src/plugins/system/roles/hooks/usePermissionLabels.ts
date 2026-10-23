"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Reads a permission code as a sentence: `product:price:write` becomes the product label
 * followed by the price-edit label, in the reader's own language.
 *
 * The stored value stays the code — that is what a guard compares — but nobody assigns a
 * role by reading `product:price:write`, so the screen shows the label instead. A permission
 * the dictionary does not name yet falls back to its own segments, which still reads and
 * never hides a function from the list.
 */
export function usePermissionLabels() {
  const t = useTranslations("permission");

  const moduleLabel = useCallback(
    (module: string) =>
      t.has(`modules.${module}`) ? t(`modules.${module}`) : module,
    [t],
  );

  const resourceLabel = useCallback(
    (resource: string) =>
      t.has(`resources.${resource}`) ? t(`resources.${resource}`) : resource,
    [t],
  );

  const actionLabel = useCallback(
    (action: string) =>
      t.has(`actions.${action}`) ? t(`actions.${action}`) : action,
    [t],
  );

  /**
   * What one scope lets its holder do. The same action reads differently per resource —
   * `quotation:confirm` is the customer's confirmation, `*:approve` on a warehouse receipt
   * signs off a stocktake adjustment — so a scope the dictionary names under `scopes` wins
   * over the generic action label.
   */
  const scopeLabel = useCallback(
    (permission: string, action: string) =>
      t.has(`scopes.${permission}`)
        ? t(`scopes.${permission}`)
        : actionLabel(action),
    [t, actionLabel],
  );

  const hasScopeLabel = useCallback(
    (permission: string) => t.has(`scopes.${permission}`),
    [t],
  );

  const permissionLabel = useCallback(
    (permission: string) => {
      const [resource, ...rest] = permission.split(":");
      const action = rest.join(":");
      return `${resourceLabel(resource)} — ${scopeLabel(permission, action)}`;
    },
    [resourceLabel, scopeLabel],
  );

  return {
    moduleLabel,
    resourceLabel,
    actionLabel,
    scopeLabel,
    hasScopeLabel,
    permissionLabel,
  };
}
