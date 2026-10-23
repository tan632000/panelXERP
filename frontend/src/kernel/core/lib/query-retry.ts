import { isAxiosError } from "axios";

import {
  DEFAULT_QUERY_RETRY,
  RATE_LIMITED_QUERY_RETRY,
  RATE_LIMIT_MAX_RETRY_DELAY_MS,
} from "@/kernel/core/constants/list-ui";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

const TOO_MANY_REQUESTS = 429;
const REQUEST_TIMEOUT = 408;
/** TanStack Query's own ceiling for its exponential backoff. */
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

/** The wait, in ms, the server asked for in a throttled response's `Retry-After`. */
function retryAfterMs(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  const raw: unknown = error.response?.headers?.["retry-after"];
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * A throttled read is retried after the block the server names, so a burst of filtering ends
 * in data rather than an error screen. Any other client error says the request itself is
 * wrong — not found, forbidden, invalid — and repeating it only spends the user's budget.
 */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  const status = getApiErrorStatus(error);
  if (status === TOO_MANY_REQUESTS) {
    return failureCount < RATE_LIMITED_QUERY_RETRY;
  }
  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== REQUEST_TIMEOUT
  ) {
    return false;
  }
  return failureCount < DEFAULT_QUERY_RETRY;
}

export function queryRetryDelay(attempt: number, error: unknown) {
  const backoff = 1000 * 2 ** attempt;
  if (getApiErrorStatus(error) === TOO_MANY_REQUESTS) {
    return Math.min(
      retryAfterMs(error) ?? backoff,
      RATE_LIMIT_MAX_RETRY_DELAY_MS,
    );
  }
  return Math.min(backoff, DEFAULT_MAX_RETRY_DELAY_MS);
}
