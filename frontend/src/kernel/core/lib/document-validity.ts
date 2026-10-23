/**
 * Where a signed document stands against its expiry date.
 *
 * `locked` wins over every date: a document put on hold while its renewal is being signed
 * must stop counting down, rather than start warning that it has expired.
 */
export type DocumentValidityState =
  "locked" | "unlimited" | "expired" | "expiringSoon" | "valid";

export interface DocumentValidity {
  state: DocumentValidityState;
  /** Days until expiry; negative once past it, and 0 for locked or open-ended documents. */
  days: number;
}

/** A document within this many days of expiry is flagged rather than shown as valid. */
export const EXPIRY_WARNING_DAYS = 30;

/** Parses the `dd/mm/yyyy` form the mock data uses. Returns null for an empty or bad value. */
export function parseDayMonthYear(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Rejects a date the calendar rolled over, e.g. 31/02 becoming 03/03.
  if (
    date.getDate() !== Number(day) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getFullYear() !== Number(year)
  ) {
    return null;
  }
  return date;
}

/**
 * Parses either date form a caller may hold: the API's `yyyy-mm-dd` or the `dd/mm/yyyy` the
 * mock data uses. Returns null for an empty or invalid value.
 */
export function parseDocumentDate(value: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) {
    const [, year, month, day] = iso;
    return parseDayMonthYear(`${day}/${month}/${year}`);
  }
  return parseDayMonthYear(value);
}

export function documentValidity(
  document: { expiryDate: string; locked?: boolean },
  today: Date = new Date(),
): DocumentValidity {
  if (document.locked) return { state: "locked", days: 0 };

  const expiry = parseDocumentDate(document.expiryDate);
  if (!expiry) return { state: "unlimited", days: 0 };

  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const days = Math.round(
    (expiry.getTime() - startOfToday.getTime()) / 86_400_000,
  );

  if (days < 0) return { state: "expired", days };
  if (days <= EXPIRY_WARNING_DAYS) return { state: "expiringSoon", days };
  return { state: "valid", days };
}
