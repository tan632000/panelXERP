import { applyDecorators } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import {
  masterDataCodeMessage,
  masterDataCodePattern,
} from '@shared/utils/master-data-code.util';

export interface MasterDataCodeOptions {
  /** Field name used in the validation messages, e.g. `Material code`. */
  label?: string;
  /** Column width guard, matching the entity (default 30). */
  maxLength?: number;
  /** Whether the field may be omitted, e.g. because the server generates it. */
  optional?: boolean;
}

/**
 * One decorator for every auto-generated-but-editable business code: an author may
 * rewrite the code, never its prefix. Reuse it for each new master-data module so
 * the shape (`PREFIX_0001`) and its message stay defined in a single place.
 */
export function IsMasterDataCode(
  prefix: string,
  {
    label = 'Code',
    maxLength = 30,
    optional = false,
  }: MasterDataCodeOptions = {},
) {
  const decorators = [
    IsString({ message: `${label} is required.` }),
    MaxLength(maxLength, {
      message: `${label} must not exceed ${maxLength} characters.`,
    }),
    Matches(masterDataCodePattern(prefix), {
      message: masterDataCodeMessage(prefix, label),
    }),
  ];

  return applyDecorators(
    ...(optional ? [IsOptional(), ...decorators] : decorators),
  );
}
