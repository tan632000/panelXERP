/**
 * The popup lifecycle every print util repeated: `window.open` from the click, `document.write`
 * the HTML, `document.close` so `window.onload` fires.
 */

/**
 * Opens the popup a print/stamp screen writes into. Must be called synchronously from the click
 * handler, before any request — browsers only allow a popup opened directly from a trusted user
 * gesture, not from inside an async callback. Returns `null` (never throws) when the popup is
 * blocked, or outside a browser.
 */
export function openPrintWindow(
  features = "width=900,height=700",
): Window | null {
  if (typeof window === "undefined") return null;
  return window.open("", "_blank", features);
}

/** Writes `html` into `popup` and closes the document, like the mock's `document.write`. */
export function writePrintDocument(popup: Window, html: string): void {
  popup.document.write(html);
  popup.document.close();
}

/**
 * Opens the popup, writes `html` into it, and reports whether it worked. `false` means the
 * popup was blocked (or there is no `window`) — the caller still owns reporting that to the user.
 */
export function printHtml(html: string, features?: string): boolean {
  const popup = openPrintWindow(features);
  if (!popup) return false;
  writePrintDocument(popup, html);
  return true;
}
