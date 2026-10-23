"use client";

import { useEffect, useRef } from "react";

import {
  buildPhoneDialPrefix,
  isPhoneDialPrefixOnly,
} from "@/kernel/core/constants/country-dial-codes";

import type {
  FieldValues,
  Path,
  PathValue,
  UseFormReturn,
} from "react-hook-form";

interface UsePhoneDialPrefixParams<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  /** Dial code of the record's country, e.g. `+84`. */
  dialCode: string | undefined;
}

/**
 * Seeds the phone field with the country's dial prefix (`+84-`) so the user types only the
 * local number. An untouched or prefix-only field takes the new prefix when the country
 * changes; a number already typed keeps its digits and swaps the prefix in front of them.
 */
export function usePhoneDialPrefix<T extends FieldValues>({
  form,
  name,
  dialCode,
}: UsePhoneDialPrefixParams<T>): void {
  const { getValues, setValue } = form;
  const previousPrefixRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prefix = buildPhoneDialPrefix(dialCode);
    const previousPrefix = previousPrefixRef.current;
    previousPrefixRef.current = prefix;

    if (!prefix || prefix === previousPrefix) return;

    const current = String(getValues(name) ?? "").trim();
    let next: string | undefined;

    if (!current || isPhoneDialPrefixOnly(current)) {
      next = prefix;
    } else if (previousPrefix && current.startsWith(previousPrefix)) {
      next = `${prefix}${current.slice(previousPrefix.length)}`;
    }

    if (next === undefined || next === current) return;
    setValue(name, next as PathValue<T, Path<T>>, { shouldValidate: false });
  }, [dialCode, getValues, name, setValue]);
}
