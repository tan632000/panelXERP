import { BadRequestException } from '@nestjs/common';

/**
 * Every generated document code carries the year it was issued in as a `-YYYY-` segment:
 * `HP-NVL-2026-0001`, `PR-MH-2026-0001`, `TLBH-2026-0001`. All generators build that segment
 * from `new Date().getFullYear()`, so a code an actor retyped with a different year would no
 * longer belong to the sequence the counter continues — it is refused rather than stored.
 */
const DOCUMENT_CODE_YEAR_SEGMENT = /-(\d{4})-/;

/** The year a code carries, or `null` when it holds no `-YYYY-` segment at all. */
export function documentCodeYear(code: string): number | null {
  const matched = DOCUMENT_CODE_YEAR_SEGMENT.exec(code.trim());
  return matched ? Number(matched[1]) : null;
}

/** Validation message shared by the service-level guards of every code carrying a year. */
export function documentCodeYearMessage(label: string): string {
  return `${label} must carry the current year.`;
}

/**
 * Refuses a submitted code whose year is neither the current one nor `keptYear` — the year a
 * record already stored, which an edit may leave untouched. Pass no `keptYear` on create,
 * where only the current year is a valid year to issue a code in.
 */
export function assertDocumentCodeYear(
  code: string,
  message: string,
  keptYear?: number | null,
): void {
  const year = documentCodeYear(code);
  const allowed = [new Date().getFullYear()];
  if (keptYear) allowed.push(keptYear);
  if (year === null || !allowed.includes(year)) {
    throw new BadRequestException(message);
  }
}
