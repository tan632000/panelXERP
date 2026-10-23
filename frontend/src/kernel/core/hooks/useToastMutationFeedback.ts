"use client";

import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";

interface ToastMutationFeedbackOptions {
  errorMessageKey?: string;
  resolveMutationError?: (error: unknown) => string | undefined;
}

export function useToastMutationFeedback(
  toastNamespace: string,
  options?: ToastMutationFeedbackOptions,
) {
  const t = useTranslations(toastNamespace);
  const errorMessageKey = options?.errorMessageKey ?? "systemError";

  return {
    errorMessage: t(errorMessageKey),
    resolveErrorMessage: (error: unknown) => {
      // A caller's own resolver names a specific business rule (e.g. "the manager approval
      // must be given by someone else") — that message is more useful than the generic
      // permission text, so it takes priority. Only fall back to the generic 403 message
      // when nothing recognizes the error, which is what an actual RBAC-guard refusal with
      // no client-facing wording looks like.
      const resolved = options?.resolveMutationError?.(error);
      if (resolved) return resolved;

      if (isAxiosError(error) && error.response?.status === 403) {
        return t("forbidden");
      }

      return undefined;
    },
  };
}
