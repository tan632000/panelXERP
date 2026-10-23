import { routing } from "@/kernel/i18n/routing";

/**
 * App locale (next-intl) → BCP-47 locale for Intl / toLocaleDateString.
 * When adding a new app locale in routing.ts, add the matching entry here.
 */
export const INTL_LOCALE_BY_APP_LOCALE = {
  vi: "vi-VN",
  en: "en-US",
  // ja: "ja-JP",
} as const satisfies Record<(typeof routing.locales)[number], string>;

export type AppLocale = (typeof routing.locales)[number];
export type IntlLocale =
  (typeof INTL_LOCALE_BY_APP_LOCALE)[keyof typeof INTL_LOCALE_BY_APP_LOCALE];

export function toIntlLocale(locale: string | undefined | null): IntlLocale {
  if (locale && locale in INTL_LOCALE_BY_APP_LOCALE) {
    return INTL_LOCALE_BY_APP_LOCALE[locale as AppLocale];
  }
  return INTL_LOCALE_BY_APP_LOCALE[routing.defaultLocale];
}
