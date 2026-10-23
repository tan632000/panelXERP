import { buildPrintDocument } from "@/kernel/core/lib/print/document";

import type { PrintDocumentOptions } from "@/kernel/core/lib/print/document";

/** What a React print sheet needs from the shell: everything but the body, which is the sheet. */
export type PrintElementOptions = Omit<PrintDocumentOptions, "body" | "head">;

/**
 * The app's own stylesheets (Tailwind utilities, `globals.css`) plus a `<base>` so their relative
 * URLs — and the sheet's images — still resolve inside the `about:blank` popup.
 */
function collectAppHead(doc: Document): string {
  const base = `<base href="${doc.location?.origin ?? ""}/">`;
  const styles = Array.from(
    doc.head.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((node) => node.outerHTML)
    .join("");
  return base + styles;
}

/**
 * The popup document for a sheet rendered by React (`<PrintSheet>`): the sheet's markup inside
 * the same `buildPrintDocument` shell every other print uses — form code at the top of each page,
 * Times New Roman, zero `@page` margin, auto-print — so an in-app sheet prints exactly like the
 * mock's `window.open` documents instead of printing the app page around it.
 */
export function buildElementPrintHtml(
  element: Element,
  options: PrintElementOptions,
): string {
  return buildPrintDocument({
    ...options,
    head: collectAppHead(element.ownerDocument),
    body: element.innerHTML,
  });
}
