import { BYTES_PER_MB } from "@/kernel/core/constants/file-size";

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function formatFileSizeMb(bytes: number | string): string {
  const mb = Math.max(0, Number(bytes)) / BYTES_PER_MB;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Decoded byte size of one stored image entry: a base64 data URI counts
 * its payload (length * 3/4 minus padding), anything else counts its UTF-8
 * length. Lets multi-image fields enforce a shared total budget.
 */
export function estimateStoredImageBytes(entry: string): number {
  const value = entry.trim();
  const comma = value.indexOf(",");
  if (value.startsWith("data:") && value.includes(";base64") && comma !== -1) {
    const payload = value.slice(comma + 1);
    let padding = 0;
    if (payload.endsWith("==")) {
      padding = 2;
    } else if (payload.endsWith("=")) {
      padding = 1;
    }
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  return new TextEncoder().encode(value).length;
}

export function getDocumentIconName(fileName: string): string {
  switch (getFileExtension(fileName)) {
    case ".pdf":
      return "file-pdf";
    case ".jpg":
    case ".jpeg":
    case ".png":
      return "photo";
    default:
      return "file-description";
  }
}

export function getDocumentIconClassName(fileName: string): string {
  switch (getFileExtension(fileName)) {
    case ".pdf":
      return "text-red-500";
    case ".jpg":
    case ".jpeg":
    case ".png":
      return "text-emerald-600";
    default:
      return "text-sky-600";
  }
}

export interface FileValidationRules {
  allowedExtensions: readonly string[];
  maxTotalBytes: number;
}

export type FileValidationError = "format" | "size";

export function resolveFileValidationMessage(
  translate: (key: "fileFormat" | "fileSize") => string,
  error: FileValidationError | null,
): string | undefined {
  if (error === "format") return translate("fileFormat");
  if (error === "size") return translate("fileSize");
  return undefined;
}

export function isAllowedFile(
  file: File,
  allowedExtensions: readonly string[],
): boolean {
  return allowedExtensions.includes(getFileExtension(file.name));
}

export function validateSingleFile(
  file: File,
  rules: {
    allowedExtensions: readonly string[];
    maxBytes: number;
  },
): FileValidationError | null {
  if (!isAllowedFile(file, rules.allowedExtensions)) {
    return "format";
  }
  if (file.size > rules.maxBytes) {
    return "size";
  }
  return null;
}

export function sumDocumentBytes(
  documents: ReadonlyArray<{ id: number; fileSize: number | string }>,
  excludedIds: readonly number[] = [],
): number {
  return documents
    .filter((doc) => !excludedIds.includes(doc.id))
    .reduce((sum, doc) => sum + Number(doc.fileSize), 0);
}

export function validateDocumentFiles(
  existingBytes: number,
  pendingFiles: File[],
  rules: FileValidationRules,
): FileValidationError | null {
  let total = existingBytes;
  for (const file of pendingFiles) {
    if (!isAllowedFile(file, rules.allowedExtensions)) {
      return "format";
    }
    total += file.size;
  }
  if (total > rules.maxTotalBytes) {
    return "size";
  }
  return null;
}

export function appendDocumentFiles(
  existingBytes: number,
  currentPending: File[],
  incomingFiles: File[],
  rules: FileValidationRules,
): { files: File[]; error: FileValidationError | null } {
  for (const file of incomingFiles) {
    if (!isAllowedFile(file, rules.allowedExtensions)) {
      return { files: currentPending, error: "format" };
    }
  }

  const merged = [...currentPending, ...incomingFiles];
  const error = validateDocumentFiles(existingBytes, merged, rules);
  if (error) {
    return { files: currentPending, error };
  }

  return { files: merged, error: null };
}

export function sortByUploadedAt<T extends { uploadedAt: string; id: number }>(
  documents: T[],
): T[] {
  return documents.slice().sort((a, b) => {
    const timeA = new Date(a.uploadedAt).getTime();
    const timeB = new Date(b.uploadedAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });
}
