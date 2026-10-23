"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

export function useValidationMessages<K extends string>(
  validationNamespace: string,
  keys: readonly K[],
): Record<K, string> {
  const t = useTranslations(validationNamespace);

  return useMemo(() => {
    const messages = {} as Record<K, string>;
    const translate = t as (key: K) => string;
    for (const key of keys) {
      messages[key] = translate(key);
    }
    return messages;
  }, [keys, t]);
}
