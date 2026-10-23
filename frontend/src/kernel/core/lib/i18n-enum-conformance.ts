/**
 * Helpers for enum/i18n conformance tests.
 *
 * Contract:
 * - Stored enum `value` (API/DB/constants): English ASCII identifier or ISO code.
 * - Code comments and identifiers: English.
 * - User-visible labels: vi/en JSON via `useTranslations`, never hard-coded in TS/TSX.
 */

/** camelCase enum token or short ISO/code (VND, EXW, pcs). */
export const ENGLISH_ENUM_VALUE_PATTERN = /^[a-z][a-zA-Z0-9]*$|^[A-Z0-9]{2,5}$/;

const VIETNAMESE_CHAR_PATTERN =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const ENUM_FIELD_PATTERN = /(?:label|value):\s*["']([^"']+)["']/g;

export interface LocalizedEnumFieldViolation {
  field: "label" | "value";
  text: string;
}

export function containsVietnamese(text: string): boolean {
  return VIETNAMESE_CHAR_PATTERN.test(text);
}

/** Flags Vietnamese copy inside TS enum option objects. */
export function findLocalizedEnumFieldViolations(
  source: string,
): LocalizedEnumFieldViolation[] {
  const violations: LocalizedEnumFieldViolation[] = [];

  for (const match of source.matchAll(ENUM_FIELD_PATTERN)) {
    const field = match[0].startsWith("label") ? "label" : "value";
    const text = match[1]?.trim() ?? "";
    if (!text || !containsVietnamese(text)) continue;
    violations.push({ field, text });
  }

  return violations;
}

export function isEnglishEnumValue(value: string): boolean {
  return ENGLISH_ENUM_VALUE_PATTERN.test(value.trim());
}

export function assertEnglishEnumValues(
  values: readonly string[],
  context: string,
): void {
  for (const value of values) {
    if (!isEnglishEnumValue(value)) {
      throw new Error(
        `${context}: enum value "${value}" must be an English identifier or ISO code`,
      );
    }
  }
}

export function assertNoLocalizedLabelsInConstants(
  options: ReadonlyArray<{ value: string; label?: string | null }>,
  context: string,
): void {
  for (const option of options) {
    const label = option.label?.trim();
    if (!label) continue;
    if (VIETNAMESE_CHAR_PATTERN.test(label)) {
      throw new Error(
        `${context}: label "${label}" belongs in vi/en JSON, not in constants`,
      );
    }
  }
}

export function flattenMessageKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) =>
      flattenMessageKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

export function assertEnumMessagesPresent(
  enumValues: readonly string[],
  viMessages: Record<string, unknown>,
  enMessages: Record<string, unknown>,
  context: string,
): void {
  const viKeys = new Set(flattenMessageKeys(viMessages));
  const enKeys = new Set(flattenMessageKeys(enMessages));

  for (const value of enumValues) {
    if (!viKeys.has(value)) {
      throw new Error(`${context}: missing vi message key for enum "${value}"`);
    }
    if (!enKeys.has(value)) {
      throw new Error(`${context}: missing en message key for enum "${value}"`);
    }
  }
}
