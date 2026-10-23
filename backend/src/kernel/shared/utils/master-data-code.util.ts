import { BadRequestException } from '@nestjs/common';

/**
 * One shape for every master-data business code: `PREFIX_` + four digits + an optional
 * free tail — `VT_0001`, `COM_0001`, `FG_0001H`, `FG_0001H_1`.
 *
 * The four digits are the part the generators count on, so they stay digits even though the
 * code is editable: `FG_xxxx` would leave nothing for the counter to continue from. Past the
 * ordinal an author is unconstrained — letters, digits, further separators, any length.
 */
export const MASTER_DATA_CODE_SEPARATOR = '_';

/** Width of the numeric ordinal that follows the prefix, matching the generators' padding. */
export const MASTER_DATA_CODE_ORDINAL_LENGTH = 4;

/**
 * Characters the free tail may use: anything but whitespace. A code is a single token — it
 * is searched, sorted and pasted as one word — so a space is the one character refused.
 */
const MASTER_DATA_CODE_TAIL_CHAR = '[^\\s]';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pattern a code of `prefix` must match, e.g. `^CCDC_[0-9]{4}[^\s]*$`. */
export function masterDataCodePattern(prefix: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(prefix)}[0-9]{${MASTER_DATA_CODE_ORDINAL_LENGTH}}${MASTER_DATA_CODE_TAIL_CHAR}*$`,
  );
}

export function isMasterDataCode(code: string, prefix: string): boolean {
  return masterDataCodePattern(prefix).test(code.trim());
}

/** Validation message shared by DTO decorators and service-level guards. */
export function masterDataCodeMessage(prefix: string, label = 'Code'): string {
  return `${label} must start with "${prefix}" followed by ${MASTER_DATA_CODE_ORDINAL_LENGTH} digits, then any characters without spaces.`;
}

/**
 * Rejects an author-supplied code that drops or rewrites the module prefix.
 * A code may be typed at create, but a record never leaves its own prefix namespace.
 */
export function assertMasterDataCode(
  code: string,
  prefix: string,
  label = 'Code',
): void {
  if (!isMasterDataCode(code, prefix)) {
    throw new BadRequestException(masterDataCodeMessage(prefix, label));
  }
}

/** Message for an edit that tries to change a code; the frontends match on it. */
export const MASTER_DATA_CODE_LOCKED_MESSAGE =
  'Code cannot be changed after creation.';

/**
 * Rejects an edit that changes an item code. Warehouse, procurement and production lines
 * keep the code as a snapshot rather than an id, so a re-coded item would strand every
 * stock lot and document filed under the old code. A submitted value equal to the current
 * one passes, so a full-form save that echoes the code back is not an error.
 */
export function assertMasterDataCodeUnchanged(
  current: string,
  submitted: string | undefined,
): void {
  if (submitted === undefined) return;
  if (submitted.trim() !== current) {
    throw new BadRequestException(MASTER_DATA_CODE_LOCKED_MESSAGE);
  }
}
