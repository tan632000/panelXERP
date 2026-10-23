/**
 * The application offset the comparison date is taken in.
 *
 * Fixed rather than read from the browser, so the date a form caps its picker at is the same
 * date the server compares against — `appToday()` in `@shared/utils/document-validity.util`.
 * Reading the visitor's own timezone would let a machine set to UTC+9 offer a day the server
 * still calls the future.
 */
const APP_UTC_OFFSET_MINUTES = 7 * 60;

/**
 * Today as `YYYY-MM-DD` in the application offset.
 *
 * Use this, never `new Date().toISOString().slice(0, 10)`: that is the UTC date, which is
 * still yesterday for the first seven hours of every Hanoi day. A picker capped at the UTC
 * date refuses the day the actor is working on, and a default value taken from it silently
 * back-dates the record by one day.
 */
export function appToday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + APP_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}
