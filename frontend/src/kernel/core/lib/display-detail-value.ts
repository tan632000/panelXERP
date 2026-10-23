export const EMPTY_DETAIL_VALUE = "-";

export function displayDetailValue(
  value: string | null | undefined,
  empty = EMPTY_DETAIL_VALUE,
): string {
  return value?.trim() ? value : empty;
}
