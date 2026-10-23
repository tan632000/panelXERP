import { BadRequestException, HttpStatus } from '@nestjs/common';

import type { ValidationError } from '@nestjs/common';

export interface FieldValidationError {
  /** Dotted path of the rejected property, e.g. `lines.0.quantity`. */
  field: string;
  message: string;
}

/**
 * Flattens `ValidationError` into one entry per rejected property.
 *
 * Nest reports the property name and the failed constraints separately, and the default
 * `ValidationPipe` throws away the first: the client receives sentences only. A form then
 * has to guess which field a sentence belongs to by matching English words, and a message
 * it cannot place is shown nowhere. Keeping the path lets the form put the message where
 * the actor is looking.
 */
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): FieldValidationError[] {
  const flattened: FieldValidationError[] = [];

  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    for (const message of Object.values(error.constraints ?? {})) {
      flattened.push({ field: path, message });
    }

    if (error.children?.length) {
      flattened.push(...flattenValidationErrors(error.children, path));
    }
  }

  return flattened;
}

/**
 * Body for a rejected payload: the sentences the pipe already sent, plus the field each
 * one belongs to. The `message` array stays as it was so existing clients keep working.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fieldErrors = flattenValidationErrors(errors);

  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    error: 'Bad Request',
    message: fieldErrors.map((fieldError) => fieldError.message),
    errors: fieldErrors,
  });
}
