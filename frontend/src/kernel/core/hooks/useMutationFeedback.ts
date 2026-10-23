"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import {
  getApiErrorStatus,
  shouldSuppressInlineFormErrorToast,
} from "@/kernel/core/lib/api-error-mapping";

interface MutationFeedbackOptions<TData = unknown> {
  /** A fixed sentence, or one built from the mutation's own response (e.g. a count). */
  successMessage?: string | ((data: TData) => string);
  errorMessage?: string;
  resolveErrorMessage?: (error: unknown) => string | undefined;
  /**
   * True for a refusal the form shows on the input itself — a per-line rule its own API-error
   * mapper places — so no generic toast doubles it.
   */
  isInlineFormError?: (error: unknown) => boolean;
}

export function useMutationFeedback<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext> &
    MutationFeedbackOptions<TData>,
) {
  const { showSuccess, showError } = useNotification();
  // Covers a caller that passes no `errorMessage` of its own — those going through
  // `useToastMutationFeedback` always do, so this is the floor rather than the usual path.
  const tCommon = useTranslations("common");
  const {
    successMessage,
    errorMessage,
    resolveErrorMessage,
    isInlineFormError,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation({
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      if (successMessage) {
        showSuccess(
          typeof successMessage === "function"
            ? successMessage(data)
            : successMessage,
        );
      }
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (err, variables, context, mutation) => {
      if (
        !shouldSuppressInlineFormErrorToast(err) &&
        !isInlineFormError?.(err)
      ) {
        /**
         * The server's own wording is never shown. It is English by contract — the same text
         * travels through Swagger, the tests and the log aggregator — so putting it in a
         * toast shows English to a reader working in Vietnamese. A caller that can say
         * something more precise than its fallback does so through `resolveErrorMessage`,
         * which reads the message and answers with one of its own localized sentences.
         */
        // A throttled write was never run, so no module rule applies to it; the reader only
        // needs to know to wait and send it again.
        showError(
          getApiErrorStatus(err) === 429
            ? tCommon("tooManyRequests")
            : (resolveErrorMessage?.(err) ??
                errorMessage ??
                tCommon("systemError")),
        );
      }
      onError?.(err, variables, context, mutation);
    },
  });
}
