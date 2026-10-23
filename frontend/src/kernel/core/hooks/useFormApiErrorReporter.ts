"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { hasFormFieldPath } from "@/kernel/core/lib/form-field-path";
import { toast } from "@/kernel/core/lib/toast";

import type { FieldErrorSetter } from "@/kernel/core/lib/errors";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/** Places an API rejection on the form's fields and reports whether it did. */
export type ApiErrorFormMapping = (setFieldError: FieldErrorSetter) => boolean;

/**
 * Reports a save rejection a form modal could not place on a field.
 *
 * `useMutationFeedback` drops its toast for rejections a form is expected to show inline,
 * so anything the mapper misses reaches nobody: the dialog stays open, nothing is saved and
 * the actor sees no reason why. Routing every mapper through here closes that gap — an error
 * either sits on a field the form actually renders, or it is announced as a toast.
 */
export function useFormApiErrorReporter<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  toastNamespace: string,
  fallbackMessageKey = "systemError",
) {
  const t = useTranslations(toastNamespace);

  return useCallback(
    (error: unknown, map: ApiErrorFormMapping): void => {
      let placed = false;

      const setFieldError: FieldErrorSetter = (field, message) => {
        // A name the form does not own would store an error no input renders, which reads
        // to the actor exactly like the silent failure this hook exists to prevent.
        if (!hasFormFieldPath(form.getValues(), field)) return;
        form.setError(field as Path<TFieldValues>, { message });
        placed = true;
      };

      if (map(setFieldError) && placed) return;
      toast.showError(t(fallbackMessageKey));
    },
    [form, t, fallbackMessageKey],
  );
}
