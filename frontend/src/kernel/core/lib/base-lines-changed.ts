import { isAxiosError } from "axios";

/**
 * Machine code of the 409 an update endpoint answers when `baseLineIds` no longer match the
 * live lines — someone changed the document since the form loaded it.
 */
export const BASE_LINES_CHANGED_CODE = "baseLinesChanged";

/** True when `error` is the stale-document rejection, however the server worded it. */
export function isBaseLinesChangedError(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 409) return false;
  // The global exception filter wraps the Nest body: the code sits under `error`.
  const data = error.response.data as
    { code?: unknown; error?: { code?: unknown } | string } | undefined;
  const nested = typeof data?.error === "object" ? data.error.code : undefined;
  return (nested ?? data?.code) === BASE_LINES_CHANGED_CODE;
}
