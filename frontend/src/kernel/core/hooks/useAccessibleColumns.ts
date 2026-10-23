"use client";

import { useMemo } from "react";

import { useOptionalAuth } from "@/kernel/core/auth/AuthContext";
import { accessibleColumns } from "@/kernel/core/lib/column-access";

import type { AccessControlledColumn } from "@/kernel/core/lib/column-access";

/**
 * The columns this account may see, to feed both the table and its settings popup.
 *
 * Passing the same list to `useListColumnPreferences` keeps a stored choice from resurrecting
 * a column the account lost access to: the stored keys are intersected with these.
 */
export function useAccessibleColumns<T extends AccessControlledColumn>(
  columns: readonly T[],
): T[] {
  // Outside the app shell — a picker dialog, a detail sub-table — no scopes can be read, so
  // a guarded column stays out rather than being shown on the strength of a missing answer.
  const auth = useOptionalAuth();
  const can = auth?.can;

  return useMemo(
    () => accessibleColumns(columns, can ?? (() => false)),
    [columns, can],
  );
}
