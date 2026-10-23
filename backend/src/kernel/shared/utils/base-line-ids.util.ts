import { applyDecorators, ConflictException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, ValidateIf } from 'class-validator';

/** Stable machine code of the 409 below; the frontend maps it to a "reload" message. */
export const BASE_LINES_CHANGED_CODE = 'baseLinesChanged';

/**
 * `baseLineIds` of an update request: the ids of the live lines the client loaded when it
 * opened the form. Required whenever the request carries `lines` (the whole line set is
 * replaced), so a client that loaded only the lines matching a list filter cannot silently
 * delete the rest. Absent `lines` means no line is touched and no ids are needed.
 */
export function BaseLineIdsField() {
  return applyDecorators(
    ApiPropertyOptional({
      description:
        'Ids of the live lines loaded when the form was opened. Required when `lines` is sent; the update is refused with 409 when they differ from the stored live lines.',
      type: [Number],
    }),
    ValidateIf((o: { lines?: unknown }) => o.lines !== undefined),
    IsArray(),
    IsInt({ each: true }),
  );
}

/**
 * Refuses an update whose `baseLineIds` (compared as a set) differ from the live line ids
 * read inside the update transaction. A line deliberately removed in the form is absent from
 * `lines` but still present in `baseLineIds`, so it passes.
 *
 * Callers pass `undefined` for `baseLineIds` only on the internal paths that replace lines
 * from an authoritative source (Excel import); those skip this guard explicitly.
 */
export function assertBaseLineIds(
  baseLineIds: readonly number[] | undefined,
  currentLineIds: readonly number[],
): void {
  const base = new Set(baseLineIds ?? []);
  const current = new Set(currentLineIds);
  const same =
    baseLineIds !== undefined &&
    base.size === current.size &&
    [...current].every((id) => base.has(id));
  if (!same) {
    throw new ConflictException({
      message:
        'The document lines changed since the form was loaded. Reload before saving.',
      code: BASE_LINES_CHANGED_CODE,
    });
  }
}
