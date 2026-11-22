import { ACCEPTANCE_FILE_MAX_COUNT } from "@plugins/delivery/acceptance/constants";
import {
  RECEIPT_FILE_EXTENSIONS,
  RECEIPT_FILE_MAX_BYTES,
} from "@plugins/delivery/delivery-note/constants";

export type AcceptanceFileProblem = "count" | "type" | "size";

/** What is wrong with the picked minutes files, if anything; the server repeats the check. */
export function acceptanceFileProblem(
  files: readonly File[],
): AcceptanceFileProblem | null {
  if (files.length > ACCEPTANCE_FILE_MAX_COUNT) return "count";
  const extensions: readonly string[] = RECEIPT_FILE_EXTENSIONS;
  const extensionOf = (file: File) =>
    file.name.split(".").pop()?.toLowerCase() ?? "";
  if (files.some((file) => !extensions.includes(extensionOf(file)))) {
    return "type";
  }
  return files.some((file) => file.size > RECEIPT_FILE_MAX_BYTES)
    ? "size"
    : null;
}
