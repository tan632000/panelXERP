/**
 * The document-validity rule, shared by every feature that files a legal document against a
 * master-data party (procurement against a supplier, sales against a customer): the comparison
 * date, the expiry computation, the thirty-day expiring-soon window, and the state precedence
 * that puts a manual lock ahead of every date outcome.
 *
 * Types here are plugin-neutral strings rather than either feature's own enum, because a
 * string enum member is not assignable to a matching string-literal type in TypeScript — a
 * caller passes its own enum value in (a string enum widens to `string` for free) and casts
 * the returned state back to its own enum at the one call site that stores it, exactly as
 * `procurement-document.service.ts` does.
 */

/**
 * A document is "expiring soon" inside this many whole days of its expiry date, inclusive at
 * both ends.
 */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * The offset the comparison date is taken in.
 *
 * There is no application timezone module in this repository, and the container sets no `TZ`,
 * so the offset is fixed here rather than inherited from whatever the host happens to be. It
 * matches the `LOG_TIMEZONE_OFFSET` default. When a timezone module arrives, this constant is
 * the single place that changes.
 */
const APP_UTC_OFFSET_MINUTES = 7 * 60;

/** `YYYY-MM-DD` in the application offset. Whole days only: a document expires on a date. */
export function appToday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + APP_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  // Reject a date the calendar does not have, e.g. 31/02.
  if (parts.month < 1 || parts.month > 12) return null;
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
    return null;
  }
  return parts;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function format({ year, month, day }: DateParts): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Whole days from `from` to `to`, negative when `to` is earlier.
 *
 * Both sides are parsed as UTC midnight, so the result is exact: no daylight-saving shift can
 * move a boundary by an hour and flip a state.
 */
export function wholeDaysBetween(from: string, to: string): number | null {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return null;
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / 86_400_000);
}

/** The unit a validity span is counted in. `'unlimited'` leaves the document without an expiry. */
/**
 * Whether a value is a calendar date the validity rules can actually work with.
 *
 * This is the single definition of "a date" for documents. `@IsISO8601()` also accepts a full
 * timestamp, which every rule below then rejects, quietly turning a dated document into an
 * unlimited one — so DTOs validate through this instead.
 */
export function isDateOnly(value: string): boolean {
  return parseDate(value) !== null;
}

export type ValidityUnit = 'day' | 'month' | 'year' | 'unlimited';

/**
 * The expiry date of a document, or null when it has none.
 *
 * Null covers three cases the caller must not distinguish: an unlimited validity, a missing
 * sign date, and a missing validity value. Adding a month keeps the day of month where the
 * target month has it and clamps to the month end where it does not, so 31 January plus one
 * month is 28 February rather than 3 March.
 */
export function computeExpiryDate(
  signDate: string | null | undefined,
  validityValue: number | null | undefined,
  validityUnit: string,
): string | null {
  if (validityUnit === 'unlimited') return null;
  if (!signDate) return null;
  if (validityValue === null || validityValue === undefined) return null;

  const start = parseDate(signDate);
  if (!start) return null;

  if (validityUnit === 'day') {
    const shifted = new Date(
      Date.UTC(start.year, start.month - 1, start.day + validityValue),
    );
    return shifted.toISOString().slice(0, 10);
  }

  const addedMonths =
    validityUnit === 'year' ? validityValue * 12 : validityValue;
  const zeroBasedMonth = start.month - 1 + addedMonths;
  const year = start.year + Math.floor(zeroBasedMonth / 12);
  const month = (((zeroBasedMonth % 12) + 12) % 12) + 1;
  const day = Math.min(start.day, daysInMonth(year, month));
  return format({ year, month, day });
}

/** The derived validity state, never stored. */
export type ValidityState =
  'locked' | 'unlimited' | 'expired' | 'expiringSoon' | 'valid';

export interface ValidityInput {
  locked: boolean;
  expiryDate?: string | null;
}

/**
 * The state a document reports, computed on every read.
 *
 * `locked` outranks every date outcome: an actor locks a document precisely so that a lapsed
 * expiry stops being reported while a renewal is being signed.
 *
 * Validity runs from 00:00 of the sign date through 23:59 of the expiry date, so the expiry
 * date is an inclusive last day: a document expires the day *after* it, never on it. That is
 * why the test is `remaining < 0` and not `remaining <= 0`.
 */
export function computeValidityState(
  document: ValidityInput,
  today: string = appToday(),
): ValidityState {
  if (document.locked) return 'locked';
  if (!document.expiryDate) return 'unlimited';

  const remaining = wholeDaysBetween(today, document.expiryDate);
  if (remaining === null) return 'unlimited';
  if (remaining < 0) return 'expired';
  if (remaining <= EXPIRY_WARNING_DAYS) return 'expiringSoon';
  return 'valid';
}
