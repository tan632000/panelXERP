import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';

/**
 * Every message a failed validation produced, including the nested ones.
 *
 * `validateSync` reports children as a tree; a client needs the flat list, and every feature
 * that unwraps a multipart body was walking that tree itself.
 */
export function flattenValidationMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) messages.push(...Object.values(error.constraints));
    if (error.children?.length) {
      messages.push(...flattenValidationMessages(error.children));
    }
  }

  return messages;
}

/**
 * Validates a plain payload against a DTO, rejecting unknown properties.
 *
 * Used where the global `ValidationPipe` cannot be: on a multipart request the raw body is
 * the JSON part plus the file fields, which no DTO describes, so the route takes an untyped
 * body and validates the unwrapped payload here instead.
 */
export function validateDtoOrThrow<T extends object>(
  DtoClass: new () => T,
  payload: object,
): T {
  const dto = plainToInstance(DtoClass, payload);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    throw new BadRequestException(flattenValidationMessages(errors));
  }

  return dto;
}

/**
 * The payload of a request that may be JSON or multipart, as an object.
 *
 * A multipart body carries the payload as one `data` JSON part beside the files, because
 * multipart has no array-of-object shape; a plain JSON body is already the payload. Returns
 * it unvalidated so a caller that strips its own fields — the ids of removed documents, say
 * — can do that before the DTO refuses them as unknown properties.
 */
export function readJsonMultipartPayload(
  body: unknown,
  invalidJsonMessage: string,
): Record<string, unknown> {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.data !== 'string') {
    const { data: _data, ...rest } = raw;
    return rest;
  }

  try {
    return JSON.parse(raw.data) as Record<string, unknown>;
  } catch {
    throw new BadRequestException(invalidJsonMessage);
  }
}

/** Reads the payload of a JSON-or-multipart request and validates it in one step. */
export function parseJsonMultipartBody<T extends object>(
  DtoClass: new () => T,
  body: unknown,
  invalidJsonMessage: string,
): T {
  return validateDtoOrThrow(
    DtoClass,
    readJsonMultipartPayload(body, invalidJsonMessage),
  );
}
