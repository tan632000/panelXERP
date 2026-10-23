/**
 * Saves a blob the browser already holds under `fileName`. `doc` is the document whose link
 * starts the download — a print popup passes its own, so the save belongs to the focused window
 * rather than the background tab that rendered the file.
 */
export function downloadBlob(
  blob: Blob,
  fileName: string,
  doc: Document = document,
): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = fileName;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick, not inline: Firefox and Safari start reading the blob after the
  // click handler returns, and dropping the URL first cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
