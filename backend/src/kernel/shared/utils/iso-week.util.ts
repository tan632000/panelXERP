/** ISO-8601 week number of a `YYYY-MM-DD` date (1..53); 0 when the value is not such a date. */
export function isoWeekNumber(dateOnly: string): number {
  const match = /^W(\d{2})\//.exec(isoWeekLabel(dateOnly));
  return match ? Number(match[1]) : 0;
}

/**
 * ISO week label for a calendar date, e.g. `W05/2026`.
 *
 * Feature-agnostic: several document features derive a "week number" column from
 * their own date field on every read rather than storing it, since a stored value would drift
 * the moment the underlying date is edited.
 */
export function isoWeekLabel(dateOnly: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return 'W--/----';
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // ISO week date: shift to the Thursday of the same week, then count weeks from the first
  // Thursday of that Thursday's year.
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoDayNumber = (date.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  date.setUTCDate(date.getUTCDate() - isoDayNumber + 3);

  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(
    firstThursday.getUTCDate() - firstThursdayDayNumber + 3,
  );

  const weekNumber =
    1 +
    Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));

  return `W${String(weekNumber).padStart(2, '0')}/${isoYear}`;
}
