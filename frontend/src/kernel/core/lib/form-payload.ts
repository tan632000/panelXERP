import { emptyToUndefined } from "@/kernel/core/lib/utils";

/** Generic form payload transforms for create/update DTO mapping (plugin-agnostic). */

/** Trim for full-form update payloads so cleared optional fields persist as "". */
export function trimFormField(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

/** Filter numeric relation ids from picker rows (0 = empty draft row). */
export function filterPositiveIds(ids: number[]): number[] {
  return ids.filter((id) => id > 0);
}

/** CREATE: omit empty optional arrays so backend treats them as not provided. */
export function normalizeOptionalArray<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined;
}

/** Filter relation rows by a positive numeric id field. */
export function filterRelationRows<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  idKey: keyof T,
): T[] {
  return (rows ?? []).filter((row) => {
    const id = row[idKey];
    return typeof id === "number" && id > 0;
  });
}

/** CREATE: filter relation rows and omit the field when empty. */
export function normalizeRelationRows<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  idKey: keyof T,
): T[] | undefined {
  return normalizeOptionalArray(filterRelationRows(rows, idKey));
}

/** CREATE: trim then omit empty optional strings. */
export function optionalTrimmedField(
  value: string | undefined | null,
): string | undefined {
  return emptyToUndefined(trimFormField(value));
}

/**
 * Decimal columns come back as fixed-scale strings ("123.0000"), so a numeric input would
 * render the padding. `Number` drops it and keeps a cleared field empty.
 */
export function numberFormField(
  value: number | string | null | undefined,
): number | "" {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  return Number.isFinite(num) ? num : "";
}

/**
 * Same as `numberFormField`, except a zero reads as an empty cell.
 *
 * A price, a VAT rate, a discount or a freight cost that nobody has entered is not the number
 * zero — it is nothing at all, and the customer asks for it to show nothing. Rendering the `0`
 * also put a digit under the caret that the next keystroke landed beside instead of replacing.
 */
export function blankZeroFormField(
  value: number | string | null | undefined,
): number | "" {
  const num = numberFormField(value);
  return num === 0 ? "" : num;
}

/**
 * A number field's stored text read back as a number, with a cleared field staying cleared.
 *
 * `parseFloat(value) || 0` turns an emptied cell straight back into `0`, which a controlled
 * caller then writes on screen — so the field could never be left blank.
 */
export function numberFromInput(value: string): number | undefined {
  if (value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
