"use client";

import { useTranslations } from "next-intl";

import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";

/**
 * Announces a code preview the server could not answer.
 *
 * A create form seeds its code field from that preview and falls back to an empty string,
 * which reads as "not filled in yet" rather than as the failure it is. Saying so lets the
 * actor retry instead of submitting a form the API will reject for a missing code.
 */
export function useNextCodeErrorToast(
  isError: boolean,
  toastNamespace: string,
): void {
  const t = useTranslations(toastNamespace);
  useQueryErrorToast(isError, t("nextCodeFailed"));
}
