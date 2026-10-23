/**
 * Client-side CSV export — keeps list exports dependency-free while staying Excel-compatible.
 *
 * Shared by every plugin that downloads rows as CSV: it lives in the kernel rather than in one
 * feature's folder so a second feature never has to reach across plugin boundaries to use it.
 *
 * The leading BOM is what makes Excel read the file as UTF-8; without it Vietnamese labels open
 * as mojibake.
 */
export function exportRowsToCsv(
  rows: Array<Record<string, string | number>>,
  columns: Array<{ key: string; header: string }>,
  fileName: string,
): void {
  const quote = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const header = columns.map((c) => quote(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => quote(row[c.key])).join(","))
    .join("\n");
  const csv = `﻿${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked on the next tick, not inline: Firefox and Safari start reading the blob after the
  // click handler returns, and dropping the URL first cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
