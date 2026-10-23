"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { USER_DEPARTMENTS } from "@/kernel/core/constants/user-departments";

/** The department picker's options, and the label of a stored department value. */
export function useUserDepartments() {
  const t = useTranslations("common.userDepartments");

  const options = useMemo(
    () => USER_DEPARTMENTS.map((value) => ({ value, label: t(value) })),
    [t],
  );

  // A value outside the list is shown as stored rather than hidden.
  const labelOf = useCallback(
    (value?: string | null) => {
      if (!value) return "";
      return t.has(value) ? t(value) : value;
    },
    [t],
  );

  return { options, labelOf };
}
