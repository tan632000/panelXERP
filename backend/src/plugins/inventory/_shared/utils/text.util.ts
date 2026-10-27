import { BadRequestException } from '@nestjs/common';

/**
 * An optional text field as stored: trimmed, and `null` when blank. A PATCH body may carry an
 * explicit `null` (the DTO's optional flag lets it through), which means "clear the field".
 */
export function trimToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** A required text field as stored: trimmed, and a 400 when missing, `null` or blank. */
export function requireText(
  value: string | null | undefined,
  message: string,
): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new BadRequestException(message);
  return trimmed;
}
