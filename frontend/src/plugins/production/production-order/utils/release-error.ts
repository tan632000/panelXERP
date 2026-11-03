import { isAxiosError } from "axios";

import { extractApiErrorMessage } from "@/kernel/core/lib/errors";

/** The fixed start of the API's 400 message; the cabinet codes follow it, joined by ", ". */
const UNFINISHED_PREFIX =
  "Every cabinet needs a technician and a planned end date: ";

/**
 * The cabinet codes a release refused for lacking a technician or a planned end date.
 *
 * Only that message names codes; any other failure names none. A tag is free text and may hold
 * a colon or a comma, so the list is read after the fixed prefix and split on the API's ", ".
 */
export function unitCodesFromReleaseError(error: unknown): string[] {
  if (!isAxiosError(error) || error.response?.status !== 400) return [];
  const message = extractApiErrorMessage(error.response.data) ?? "";
  if (!message.startsWith(UNFINISHED_PREFIX)) return [];
  return message
    .slice(UNFINISHED_PREFIX.length)
    .replace(/\.$/, "")
    .split(", ")
    .map((code) => code.trim())
    .filter(Boolean);
}
