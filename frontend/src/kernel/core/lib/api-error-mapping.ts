import { isAxiosError } from "axios";

import { isBaseLinesChangedError } from "@/kernel/core/lib/base-lines-changed";
import {
  applyApiFieldErrors,
  extractApiErrorMessage,
  type ApiErrorBody,
  type FieldErrorSetter,
} from "@/kernel/core/lib/errors";

/**
 * One rule of a module's error table: which server wordings it recognizes, which field owns
 * them, and the i18n key of the sentence to show there.
 *
 * The key is required. The server phrases its rejections in English for the log — a rule that
 * cannot be relaxed, since the message travels through Swagger, tests and log aggregation —
 * so a form that displayed the raw text would show English to a reader working in Vietnamese.
 * The key is resolved against the namespace the caller's translator is bound to.
 */
export type KeywordFieldMatcher = readonly [
  keywords: readonly string[],
  field: string,
  messageKey: string,
];

/** A module's translator, bound to the namespace its error keys live in. */
export type ErrorMessageTranslator = (key: string) => string;

export type KeywordToastRule = readonly [readonly string[], string];

export function getApiErrorMessageLower(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  return extractApiErrorMessage(error.response?.data)?.toLowerCase();
}

/**
 * Presents a message the API reported inside a successful response — a bulk delete names one
 * refusal per row in its body — in the shape the delete-reason rules read.
 *
 * Those rules are written per plugin against a failed request, and they are the only place
 * that knows which localized reason a backend wording means. Restating them for the bulk
 * shape would leave two copies to keep in step, so the message is handed to them as the
 * rejection it would have been had that row been deleted on its own.
 */
export function asApiErrorForMessage(message: string, status = 400): unknown {
  return {
    isAxiosError: true,
    response: { status, data: { message } },
  };
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/**
 * A structured detail an endpoint attached to its rejection, such as the plan codes that
 * blocked a bulk delete.
 *
 * Read at both levels because the API wraps a rejection's body in `error` while a plain
 * `BadRequestException(string)` leaves its fields at the top: a caller that knows only one
 * shape silently reads `undefined` and drops the very detail the reader needed.
 */
export function getApiErrorDetail<T>(
  error: unknown,
  key: string,
): T | undefined {
  if (!isAxiosError(error)) return undefined;
  const data = error.response?.data as Record<string, unknown> | undefined;
  if (!data) return undefined;

  const top = data[key];
  if (top !== undefined) return top as T;

  const nested = data.error;
  if (nested && typeof nested === "object") {
    return (nested as Record<string, unknown>)[key] as T | undefined;
  }
  return undefined;
}

export function isNotFoundError(error: unknown): boolean {
  return getApiErrorStatus(error) === 404;
}

export function isDuplicateConflictError(
  status: number | undefined,
  messageLower: string,
): boolean {
  return (
    status === 409 ||
    messageLower.includes("already exists") ||
    messageLower.includes("unique")
  );
}

/**
 * Whether a conflict is one a form shows on a field. `isDuplicateConflictError` answers on
 * status alone, which is right where a 409 can only mean a taken value, but 409 also carries
 * refusals no form owns — a delete blocked by a reference, a claim lost to another actor —
 * and those must reach the user as a toast rather than be dropped as already-shown.
 */
function namesADuplicateValue(messageLower: string): boolean {
  return (
    messageLower.includes("already exists") ||
    messageLower.includes("unique") ||
    messageLower.includes("duplicate")
  );
}

/** Form modals map these API rejections inline — no duplicate toast. */
export function shouldSuppressInlineFormErrorToast(error: unknown): boolean {
  if (!isAxiosError(error)) return false;

  const status = error.response?.status;
  if (status === 403) return false;
  // 401 is handled once, globally, by the session-expired listener in AuthContext —
  // showing this mutation's own generic/raw-backend toast on top would be a confusing
  // duplicate right before the redirect to /login.
  if (status === 401) return true;
  // The form announces a stale document itself (reload message + refetch).
  if (isBaseLinesChangedError(error)) return true;

  const data = error.response?.data as ApiErrorBody | undefined;
  if (data?.errors?.length) return true;

  const lower = extractApiErrorMessage(data)?.toLowerCase() ?? "";
  if (!lower) return false;

  if (namesADuplicateValue(lower)) return true;

  if (status === 400 || status === 422) {
    const inlineValidationKeywords = [
      "required",
      "must not exceed",
      "must not",
      "must be",
      "invalid",
      "duplicate",
      "already exists",
    ] as const;
    if (inlineValidationKeywords.some((keyword) => lower.includes(keyword))) {
      return true;
    }
  }

  return false;
}

export function applyDuplicateFieldError(
  status: number | undefined,
  messageLower: string,
  setFieldError: FieldErrorSetter,
  field: string,
  message: string,
): boolean {
  if (!isDuplicateConflictError(status, messageLower)) return false;
  setFieldError(field, message);
  return true;
}

export function mapApiErrorToForm(
  error: unknown,
  setFieldError: FieldErrorSetter,
  mapMessage: (message: string, messageLower: string) => boolean,
): boolean {
  const { data, mapped } = applyApiFieldErrors(error, setFieldError);
  const apiMessage = extractApiErrorMessage(data);
  if (!apiMessage) return mapped;
  return mapMessage(apiMessage, apiMessage.toLowerCase()) || mapped;
}

/**
 * Match the server's wording against a module's table and put the module's own localized
 * sentence on the field that owns it. The raw API text is read for matching only, never
 * shown.
 */
export function applyKeywordFieldMatchers(
  messageLower: string,
  setFieldError: FieldErrorSetter,
  matchers: readonly KeywordFieldMatcher[],
  translate: ErrorMessageTranslator,
): boolean {
  for (const [keywords, field, messageKey] of matchers) {
    if (keywords.some((keyword) => messageLower.includes(keyword))) {
      setFieldError(field, translate(messageKey));
      return true;
    }
  }
  return false;
}

/** Resolve a toast i18n key from English API error keywords. */
export function resolveToastKeyByKeywords(
  error: unknown,
  rules: readonly KeywordToastRule[],
): string | null {
  const messageLower = getApiErrorMessageLower(error);
  if (!messageLower) return null;

  for (const [keywords, key] of rules) {
    if (keywords.some((keyword) => messageLower.includes(keyword))) {
      return key;
    }
  }

  return null;
}

/**
 * Which field a duplicate-key rejection belongs to, and the message to show on it.
 * `null` leaves the rejection to the generic field matchers.
 */
export type DuplicateFieldResolver<TMessages> = (
  lowerMessage: string,
  messages: TMessages,
) => readonly [field: string, message: string] | null;

export interface ApiErrorFormMapperConfig<TMessages> {
  /** Keyword table mapping a server message fragment to a form field. */
  fieldMatchers: readonly KeywordFieldMatcher[];
  /** Applied first, for 409-style duplicate rejections. */
  resolveDuplicateField?: DuplicateFieldResolver<TMessages>;
}

/**
 * Builds the form-error mapper every master-data module needs.
 *
 * Each module differed only in its keyword table and in which field owns a duplicate-key
 * rejection; the surrounding sequence — read the message, try the duplicate rule, then the
 * keyword matchers, else fall back to whatever the field extractor already applied — was
 * copied verbatim. A module with genuinely different behavior still writes its own.
 */
export function createApiErrorFormMapper<TMessages>(
  config: ApiErrorFormMapperConfig<TMessages>,
) {
  return function mapApiErrorsToForm(
    error: unknown,
    setFieldError: FieldErrorSetter,
    messages: TMessages,
    translate: ErrorMessageTranslator,
  ): boolean {
    const { data, mapped } = applyApiFieldErrors(error, setFieldError);
    if (!isAxiosError(error)) return mapped;

    const apiMessage = extractApiErrorMessage(data);
    if (!apiMessage) return mapped;

    const lower = apiMessage.toLowerCase();

    if (
      config.resolveDuplicateField &&
      isDuplicateConflictError(error.response?.status, lower)
    ) {
      const duplicate = config.resolveDuplicateField(lower, messages);
      if (duplicate) {
        setFieldError(duplicate[0], duplicate[1]);
        return true;
      }
    }

    if (
      applyKeywordFieldMatchers(
        lower,
        setFieldError,
        config.fieldMatchers,
        translate,
      )
    ) {
      return true;
    }

    return mapped;
  };
}

/**
 * Builds the delete-block toast resolver. Rules are evaluated in order, so a specific
 * holder ("referenced by internal products") must precede a general one ("referenced").
 */
export function createDeleteToastKeyResolver<TKey extends string>(
  rules: readonly KeywordToastRule[],
) {
  return function resolveDeleteToastKey(error: unknown): TKey | null {
    return resolveToastKeyByKeywords(error, rules) as TKey | null;
  };
}

/**
 * Builds the mapper for an endpoint whose only client-correctable rejection belongs to one
 * field — a contact's e-mail address, for example.
 *
 * A conflict status, or a message naming the field or a uniqueness violation, lands on that
 * field carrying the caller's wording rather than the raw server text, because the server
 * phrases these in English for the log. Anything else falls through to whatever the field
 * extractor already applied.
 */
export function createSingleFieldConflictMapper<TMessages>(
  field: string,
  keywords: readonly string[],
  selectMessage: (messages: TMessages) => string,
) {
  return function mapApiErrorsToForm(
    error: unknown,
    setFieldError: FieldErrorSetter,
    messages: TMessages,
  ): boolean {
    const { data, mapped } = applyApiFieldErrors(error, setFieldError);
    if (!isAxiosError(error)) return false;

    const apiMessage = extractApiErrorMessage(data);
    if (!apiMessage) return mapped;

    const lower = apiMessage.toLowerCase();
    if (
      error.response?.status === 409 ||
      keywords.some((keyword) => lower.includes(keyword))
    ) {
      setFieldError(field, selectMessage(messages));
      return true;
    }

    return mapped;
  };
}
