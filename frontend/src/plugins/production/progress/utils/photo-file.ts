import {
  PHOTO_EXTENSIONS,
  PHOTO_MAX_BYTES,
} from "@plugins/production/progress/constants";

export type PhotoFileProblem = "type" | "size" | "empty";

/**
 * Why a picked file will not be uploaded, or `null` when it may be. This saves a round trip
 * for the obvious mistakes; the server repeats the check and also reads the content.
 */
export function photoFileProblem(file: File): PhotoFileProblem | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!(PHOTO_EXTENSIONS as readonly string[]).includes(extension)) {
    return "type";
  }
  if (file.size === 0) return "empty";
  if (file.size > PHOTO_MAX_BYTES) return "size";
  return null;
}
