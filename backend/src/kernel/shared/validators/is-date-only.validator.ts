import { registerDecorator, type ValidationOptions } from 'class-validator';

import { isDateOnly } from '@shared/utils/document-validity.util';

/**
 * Accepts only a calendar date in `YYYY-MM-DD` form, the shape the document validity rules
 * parse. Unlike `@IsISO8601()` it refuses a full timestamp, which would otherwise pass
 * validation and then fail every downstream rule silently.
 */
export function IsDateOnly(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a calendar date in YYYY-MM-DD form`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isDateOnly(value),
      },
    });
  };
}
