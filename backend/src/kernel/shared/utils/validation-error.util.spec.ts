import {
  flattenValidationErrors,
  validationExceptionFactory,
} from './validation-error.util';

import type { ValidationError } from '@nestjs/common';

function error(partial: Partial<ValidationError>): ValidationError {
  return { property: '', ...partial };
}

describe('flattenValidationErrors', () => {
  it('keeps the property name beside every constraint message', () => {
    const flattened = flattenValidationErrors([
      error({
        property: 'code',
        constraints: {
          isNotEmpty: 'code should not be empty',
          matches: 'code must match the pattern',
        },
      }),
    ]);

    expect(flattened).toEqual([
      { field: 'code', message: 'code should not be empty' },
      { field: 'code', message: 'code must match the pattern' },
    ]);
  });

  it('reports a nested property under its dotted path', () => {
    const flattened = flattenValidationErrors([
      error({
        property: 'lines',
        children: [
          error({
            property: '0',
            children: [
              error({
                property: 'quantity',
                constraints: { min: 'quantity must not be less than 1' },
              }),
            ],
          }),
        ],
      }),
    ]);

    expect(flattened).toEqual([
      {
        field: 'lines.0.quantity',
        message: 'quantity must not be less than 1',
      },
    ]);
  });
});

describe('validationExceptionFactory', () => {
  it('answers 400 with both the sentences and their fields', () => {
    const exception = validationExceptionFactory([
      error({
        property: 'name',
        constraints: { isNotEmpty: 'name should not be empty' },
      }),
    ]);

    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['name should not be empty'],
      errors: [{ field: 'name', message: 'name should not be empty' }],
    });
  });
});
