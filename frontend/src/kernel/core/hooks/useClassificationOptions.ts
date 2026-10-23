"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

const DEFAULT_CLASSIFICATION_COLOR = "bg-gray-50 text-gray-700 border-gray-200";

/** Enum option: `value` is both API/DB slug and i18n key under `namespace`. */
export interface ClassificationItem<T extends string = string> {
  value: T;
  colorClass?: string;
}

export interface ClassificationOptions<T extends string = string> {
  options: Array<{ value: T; label: string }>;
  getLabel: (value?: string | null) => string;
  getColorClass: (value: T) => string;
  /**
   * The enum values whose label (or value) contains `keyword`, accent-insensitively.
   *
   * A classification column stores an English enum while the UI shows a translated label, so a
   * search for a localized keyword can only reach the English enum via this mapping.
   */
  matchValues: (keyword: string) => T[];
}

/** Folds case and diacritics so accent variants of the same keyword match each other. */
function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

export function useClassificationOptions<T extends string>(
  namespace: string,
  items: ReadonlyArray<ClassificationItem<T>>,
  byValue: Record<T, ClassificationItem<T>>,
): ClassificationOptions<T> {
  const t = useTranslations(namespace);

  return useMemo((): ClassificationOptions<T> => {
    // Dynamic enum keys under a runtime namespace; next-intl cannot type them.
    const translate = (key: string) => t(key as never);

    return {
      options: items.map((item) => ({
        value: item.value,
        label: translate(item.value),
      })),
      getLabel: (value?: string | null) => {
        if (!value) return "";
        if (!(value in byValue)) return value;
        return translate(value);
      },
      getColorClass: (value: T) =>
        byValue[value]?.colorClass ?? DEFAULT_CLASSIFICATION_COLOR,
      matchValues: (keyword: string) => {
        const needle = foldForSearch(keyword);
        if (!needle) return [];
        return items
          .filter((item) => {
            const label = foldForSearch(translate(item.value));
            return (
              label.includes(needle) ||
              foldForSearch(item.value).includes(needle)
            );
          })
          .map((item) => item.value);
      },
    };
  }, [byValue, items, t]);
}
