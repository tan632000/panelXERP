/**
 * The SQL form of the shared document-validity rule (`document-validity.util.ts`), so a list's
 * validity filter and its column filter narrow in the database using the exact same case
 * expression that the projection computes in TypeScript, keyed to the same thirty-day window
 * and the same application offset.
 */

/**
 * Today in the application offset, as SQL.
 *
 * The comparison date is a date, never a timestamp, so the thirty-day boundary cannot drift
 * during the day. The offset matches `APP_UTC_OFFSET_MINUTES` in `document-validity.util.ts`.
 */
export const APP_TODAY_SQL = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

/**
 * The derived validity state, as SQL, for the document table aliased as `alias`.
 *
 * Every caller reads the same expression for both its toolbar validity filter and its column
 * filter, so a row can never be offered under one state and matched under another. It mirrors
 * `computeValidityState`, which owns the same rule for the projection; the boundary cases are
 * pinned by tests on both sides.
 *
 * The expiry date is an inclusive last day — validity runs through 23:59 of it — so the
 * expired test is `expiry_date < today`, never `<=`.
 */
export function buildValidityStateSql(alias: string): string {
  return `CASE
  WHEN "${alias}"."locked" THEN 'locked'
  WHEN "${alias}"."expiry_date" IS NULL THEN 'unlimited'
  WHEN "${alias}"."expiry_date" < ${APP_TODAY_SQL} THEN 'expired'
  WHEN "${alias}"."expiry_date" <= ${APP_TODAY_SQL} + 30 THEN 'expiringSoon'
  ELSE 'valid'
END`;
}
