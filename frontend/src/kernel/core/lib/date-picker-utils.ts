import { format, isValid, parse, parseISO } from "date-fns";

/**
 * Accepts a plain `yyyy-MM-dd` date as well as a full ISO datetime (e.g. a `date`-typed
 * column serialized with a time component by the API's JSON layer) — falls back to
 * `parseISO` only when the strict date-only parse fails, so existing plain-date behavior is
 * unchanged.
 */
export function parseIsoDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const date = parse(iso, "yyyy-MM-dd", new Date());
  if (isValid(date)) return date;
  const isoDate = parseISO(iso);
  return isValid(isoDate) ? isoDate : undefined;
}

export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatIsoDisplay(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? format(date, "dd/MM/yyyy") : iso;
}
