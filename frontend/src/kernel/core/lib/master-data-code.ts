import { z } from "zod";

/**
 * One shape for every master-data business code: `PREFIX_` + four digits + an optional
 * free tail — `VT_0001`, `COM_0001`, `FG_0001H`, `FG_0001H_1`.
 *
 * Codes are auto-generated but stay editable. The four digits are the part the server's
 * counter continues from, so they stay digits; past the ordinal an author is unconstrained.
 * Keep this the single client-side definition of that rule, mirroring
 * `backend/src/kernel/shared/utils/master-data-code.util.ts`, so a new module only supplies
 * its own prefix.
 */
export const MASTER_DATA_CODE_SEPARATOR = "_";

/** Width of the numeric ordinal that follows the prefix, matching the server's padding. */
export const MASTER_DATA_CODE_ORDINAL_LENGTH = 4;

/**
 * Characters the free tail may use: anything but whitespace. A code is a single token — it
 * is searched, sorted and pasted as one word — so a space is the one character refused.
 */
const MASTER_DATA_CODE_TAIL_CHAR = "[^\\s]";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pattern a code of `prefix` must match, e.g. `^CCDC_[0-9]{4}[^\s]*$`. */
export function masterDataCodePattern(prefix: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(prefix)}[0-9]{${MASTER_DATA_CODE_ORDINAL_LENGTH}}${MASTER_DATA_CODE_TAIL_CHAR}*$`,
  );
}

export function isMasterDataCode(value: string, prefix: string): boolean {
  return masterDataCodePattern(prefix).test(value.trim());
}

export interface MasterDataCodeMessages {
  /** Shown when the field is left empty and the code is required. */
  required: string;
  /** Shown when the value exceeds `maxLength`. */
  max: string;
  /** Shown when the value drops or rewrites the prefix. */
  prefix: string;
}

export interface MasterDataCodeSchemaOptions {
  prefix: string;
  messages: MasterDataCodeMessages;
  /** Column ceiling of the module (default 30). */
  maxLength?: number;
}

/**
 * Zod schema for a required code field. Reuse it in every module's form schema so
 * the prefix rule and its message stay defined in a single place.
 */
export function masterDataCodeSchema({
  prefix,
  messages,
  maxLength = 30,
}: MasterDataCodeSchemaOptions) {
  return z
    .string()
    .trim()
    .min(1, messages.required)
    .max(maxLength, messages.max)
    .refine((value) => isMasterDataCode(value, prefix), {
      message: messages.prefix,
    });
}

/**
 * Same rule for a field the server may fill in: an empty value passes, any other
 * value must still carry the prefix.
 */
export function optionalMasterDataCodeSchema({
  prefix,
  messages,
  maxLength = 30,
}: MasterDataCodeSchemaOptions) {
  return z
    .string()
    .trim()
    .max(maxLength, messages.max)
    .refine((value) => value === "" || isMasterDataCode(value, prefix), {
      message: messages.prefix,
    })
    .optional();
}
