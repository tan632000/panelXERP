/**
 * ISO week label mirroring the mock (`W29/2026`): `W` + two-digit week + `/` +
 * week-numbering year. Empty when the value is not a `YYYY-MM-DD` date.
 */
export function toIsoWeekLabel(value: string | undefined | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const day = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(day.getTime())) return "";
  const thursday = new Date(day);
  thursday.setDate(day.getDate() - ((day.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(
    firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3,
  );
  const week = String(
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000),
  ).padStart(2, "0");
  return `W${week}/${thursday.getFullYear()}`;
}
