/**
 * Mirrors `PASSWORD_MIN_LENGTH` / `PASSWORD_PATTERN` in the backend's
 * `reset-password.dto.ts`. Checking here only saves the round trip — the DTO is what decides.
 * The rules stay split so a form can show which one is still unmet.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES = [
  "minLength",
  "letter",
  "digit",
  "special",
] as const;

export type PasswordRule = (typeof PASSWORD_RULES)[number];

const RULE_TESTS: Record<PasswordRule, (value: string) => boolean> = {
  minLength: (value) => value.length >= PASSWORD_MIN_LENGTH,
  letter: (value) => /[A-Za-z]/.test(value),
  digit: (value) => /\d/.test(value),
  special: (value) => /[^A-Za-z0-9]/.test(value),
};

export function checkPasswordRules(
  value: string,
): Record<PasswordRule, boolean> {
  return {
    minLength: RULE_TESTS.minLength(value),
    letter: RULE_TESTS.letter(value),
    digit: RULE_TESTS.digit(value),
    special: RULE_TESTS.special(value),
  };
}

export function isStrongEnoughPassword(value: string): boolean {
  return PASSWORD_RULES.every((rule) => RULE_TESTS[rule](value));
}
