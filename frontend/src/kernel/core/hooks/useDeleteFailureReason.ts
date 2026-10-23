"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { asApiErrorForMessage } from "@/kernel/core/lib/api-error-mapping";

/**
 * Turns the backend wording of one refused delete into the reason this plugin shows for it.
 *
 * A bulk delete reports why each row was kept, and those reasons must read the way the
 * single-row delete already phrases them, so the plugin's own delete-reason rules do the
 * matching. A wording no rule recognises falls back to a generic line rather than surfacing
 * the raw English the backend logs.
 */
export function useDeleteFailureReason(
  toastNamespace: string,
  resolveToastKey?: (error: unknown) => string | null,
): (message: string) => string {
  const t = useTranslations(toastNamespace);
  const tBulk = useTranslations("common.bulkDelete");

  return useCallback(
    (message: string) => {
      const key = resolveToastKey?.(asApiErrorForMessage(message)) ?? null;
      return key ? t(key) : tBulk("reasonUnknown");
    },
    [resolveToastKey, t, tBulk],
  );
}
