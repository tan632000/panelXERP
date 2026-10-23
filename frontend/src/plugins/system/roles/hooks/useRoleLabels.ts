"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { useAssignableRoles } from "@plugins/system/users/hooks/api/useAdminUsers";

/**
 * Names a role in the reader's language.
 *
 * The seeded `roles.name` is English, and the profile screen already translates the same 17
 * actors through `auth.roles.<code>`; this reuses that dictionary so a role reads the same
 * everywhere. A role the dictionary does not name falls back to its stored name.
 */
export function useRoleLabels() {
  const t = useTranslations("auth");
  const { data } = useAssignableRoles();

  const nameToCode = useMemo(
    // An empty body answers `null`, which a default parameter would not catch.
    () => new Map((data ?? []).map((role) => [role.name, role.code])),
    [data],
  );

  const labelOfCode = useCallback(
    (code?: string | null, fallback?: string | null) => {
      if (!code) return fallback ?? "";
      return t.has(`roles.${code}`) ? t(`roles.${code}`) : (fallback ?? code);
    },
    [t],
  );

  /** The list API filters and sorts by the stored name, so a cell value arrives as one. */
  const labelOfName = useCallback(
    (name?: string | null) =>
      name ? labelOfCode(nameToCode.get(name), name) : "",
    [labelOfCode, nameToCode],
  );

  return { labelOfCode, labelOfName };
}
