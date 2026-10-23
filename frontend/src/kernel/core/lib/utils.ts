/** Convert empty/falsy form strings to `undefined` for optional API fields. */
export function emptyToUndefined(
  value: string | undefined | null,
): string | undefined {
  return value || undefined;
}

/**
 * Generates a unique client-side identifier.
 * Falls back gracefully when `crypto.randomUUID` is unavailable (e.g. non-secure HTTP contexts).
 */
export function generateClientUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
