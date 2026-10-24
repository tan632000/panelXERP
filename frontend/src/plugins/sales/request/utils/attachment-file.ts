import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_BYTES,
} from "@plugins/sales/request/constants";

export type AttachmentFileProblem = "type" | "size" | "empty";

/** The lower-cased extension of a file name, or `null` when it has none. */
export function fileExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * Why a picked file will not be uploaded, or `null` when it may be. This saves a round trip
 * for the obvious mistakes; the server repeats the check and also reads the content.
 */
export function attachmentFileProblem(
  file: File,
): AttachmentFileProblem | null {
  const extension = fileExtension(file.name);
  if (
    !extension ||
    !(ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return "type";
  }
  if (file.size === 0) return "empty";
  if (file.size > ATTACHMENT_MAX_BYTES) return "size";
  return null;
}

/** `1.4 MB`, `230 KB`: sizes in the unit a reader scans a drawing list by. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
