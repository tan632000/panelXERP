import { isAxiosError } from "axios";

import { extractApiErrorMessage } from "@/kernel/core/lib/errors";

/**
 * The cabinet codes a refused delivery note names. The server words the 400 in English ("These
 * cabinets cannot be delivered: A, B."), so the codes are read out of it and the sentence shown
 * is the form's own. Null for any other refusal.
 */
export function refusedUnitCodes(error: unknown): string | null {
  if (!isAxiosError(error) || error.response?.status !== 400) return null;
  const message = extractApiErrorMessage(error.response.data);
  const match = /cannot be delivered:\s*(.+?)\.?$/.exec(message ?? "");
  return match ? match[1] : null;
}
