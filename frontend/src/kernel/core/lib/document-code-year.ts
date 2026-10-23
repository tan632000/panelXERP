import { appToday } from "@/kernel/core/lib/app-today";

/**
 * Every generated document code carries the year it was issued in as a `-YYYY-` segment:
 * `HP-NVL-2026-0001`, `PR-MH-2026-0001`, `TLBH-2026-0001`. All generators build that segment
 * from the current year, so a retyped code holding a different year would no longer belong
 * to the sequence the server's counter continues — the form refuses it rather than waiting
 * for the save to fail.
 *
 * Mirrors `backend/src/kernel/shared/utils/document-code-year.util.ts`.
 */
const DOCUMENT_CODE_YEAR_SEGMENT = /-(\d{4})-/;

/** The year a code carries, or `null` when it holds no `-YYYY-` segment at all. */
export function documentCodeYear(code: string): number | null {
  const matched = DOCUMENT_CODE_YEAR_SEGMENT.exec(code.trim());
  return matched ? Number(matched[1]) : null;
}

/** The year a code issued right now belongs to, taken in the application offset. */
export function currentCodeYear(): number {
  return Number(appToday().slice(0, 4));
}

/**
 * Whether a code's year is one it may carry: the current one, or `keptYear` — the year a
 * record already stored, which an edit may leave untouched. Pass no `keptYear` on create.
 */
export function hasAllowedCodeYear(
  code: string,
  keptYear?: number | null,
): boolean {
  const year = documentCodeYear(code);
  if (year === null) return false;
  return year === currentCodeYear() || (Boolean(keptYear) && year === keptYear);
}
