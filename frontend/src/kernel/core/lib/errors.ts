import { isAxiosError } from "axios";

import type { ZodError } from "zod";

export interface ApiErrorBody {
  message?: string | string[];
  error?: string | { message?: string | string[]; error?: string };
  statusCode?: number;
  errors?: Array<{ field: string; message: string }>;
}

export type FieldErrorSetter = (field: string, message: string) => void;

function extractMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join(", ");
  }
  return undefined;
}

export function extractApiErrorMessage(
  data: ApiErrorBody | undefined,
): string | undefined {
  if (!data) return undefined;

  if (data.error && typeof data.error === "object") {
    const nested = extractMessage(data.error.message);
    if (nested) return nested;
  }

  const flat = extractMessage(data.message);
  if (flat) return flat;

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  return undefined;
}

export function getErrorMessage(
  error: unknown,
  fallback = "An error occurred",
): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as ApiErrorBody | undefined;
    const fromBody = extractApiErrorMessage(data);
    if (fromBody) return fromBody;

    if (error.response?.status && !error.response.data) {
      return fallback;
    }

    if (
      error.message &&
      !/^Request failed with status code \d+$/i.test(error.message)
    ) {
      return error.message;
    }

    return fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Apply Nest-style `{ errors: [{ field, message }] }` onto a form. */
export function applyApiFieldErrors(
  error: unknown,
  setFieldError: FieldErrorSetter,
): { data: ApiErrorBody | undefined; mapped: boolean } {
  if (!isAxiosError(error)) {
    return { data: undefined, mapped: false };
  }

  const data = error.response?.data as ApiErrorBody | undefined;
  let mapped = false;

  if (data?.errors?.length) {
    for (const fe of data.errors) {
      setFieldError(fe.field, fe.message);
      mapped = true;
    }
  }

  return { data, mapped };
}

/**
 * Apply a Zod parse failure onto a form, one issue per top-level field.
 *
 * Only the first path segment is used, so a nested issue lands on the field that owns it
 * rather than on a path react-hook-form cannot address. The field type is inferred from the
 * setter, which keeps the caller's form values typed without this module knowing them.
 */
export function applyZodIssuesToForm<TField extends string>(
  error: ZodError,
  setFieldError: (field: TField, error: { message: string }) => void,
): void {
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string") {
      setFieldError(field as TField, { message: issue.message });
    }
  }
}
