import {
  DOCUMENT_FONT_FAMILY,
  STAMP_FONT_FAMILY,
} from "@/kernel/core/lib/print/fonts";
import { escapeHtml } from "@/kernel/core/lib/print/html";
import { buildPageCss } from "@/kernel/core/lib/print/page-css";

export type PrintDocumentFont = "document" | "stamp";

export type PrintDocumentAutoPrint = "onload" | { delayMs: number } | false;

export interface PrintDocumentOptions {
  /** The popup/tab title; most browsers also name a saved PDF after it. Always escaped. */
  title: string;
  /** Extra CSS appended after the base reset + font-family + page-margin rule. */
  css?: string;
  body: string;
  /** `"document"` (default) or `"stamp"` — both Times New Roman (see `fonts.ts`); a stamp only
   * differs in its default zero page margin. */
  font?: PrintDocumentFont;
  /**
   * `"onload"` (default) prints as soon as the popup's `window.onload` fires, like the mock;
   * `{ delayMs }` waits a tick first (a canvas/QR still drawing); `false` omits the script
   * entirely (a stamp screen that prints from its own on-screen button).
   */
  autoPrint?: PrintDocumentAutoPrint;
  /** `@page` size forwarded to `buildPageCss` — e.g. `"A4"`, `"A4 landscape"`, a stamp's own mm
   * size. Omitted keeps the browser's default page size. */
  pageSize?: string;
  /**
   * The document's own visual margin, applied as body padding since the `@page` margin is
   * always forced to 0 (see `page-css.ts` — no printed page may show the browser's own
   * header/footer). Defaults to 12mm for a `"document"`; a `"stamp"` defaults to 0 since it is
   * already sized and padded to its own physical label.
   */
  pageMarginMm?: number;
  /** Extra CSS merged into the `@media print` block — e.g. hiding an on-screen toolbar. */
  printOnlyCss?: string;
  /**
   * Raw markup placed in `<head>` before the shell's own `<style>` — the app's stylesheets when a
   * React sheet is printed through `print-element.ts`, so the shell's font, margin and `@page`
   * rules still win over them.
   */
  head?: string;
}

function buildAutoPrintScript(autoPrint: PrintDocumentAutoPrint): string {
  if (autoPrint === false) return "";
  const delayMs = autoPrint === "onload" ? 0 : autoPrint.delayMs;
  const call =
    delayMs > 0
      ? `setTimeout(()=>window.print(),${delayMs})`
      : "window.print()";
  return `<script>window.onload=()=>{${call};}<\/script>`;
}

/**
 * The `<!DOCTYPE>`/`<title>`/`<style>` shell every print popup wrote by hand: the font stack,
 * the forced zero-margin `@page` (so the browser's own print header/footer never renders — see
 * `page-css.ts`), the caller's own CSS and body, and the auto-print script.
 */
export function buildPrintDocument(options: PrintDocumentOptions): string {
  const {
    title,
    css = "",
    body,
    font = "document",
    autoPrint = "onload",
    pageSize,
    pageMarginMm = font === "stamp" ? 0 : 12,
    printOnlyCss = "",
    head = "",
  } = options;
  const fontFamily =
    font === "stamp" ? STAMP_FONT_FAMILY : DOCUMENT_FONT_FAMILY;
  // The mock's `_QCPF_PRINT_CSS` / per-form `body{font-size:12px;color:#111}`: without it a
  // document's unsized text falls back to the browser's 16px. Callers' own `css` still wins.
  const documentText = font === "stamp" ? "" : "font-size:12px;color:#111;";
  const baseStyle = `*{box-sizing:border-box}body{font-family:${fontFamily};${documentText}margin:0;padding:${pageMarginMm}mm}`;
  const printStyle = printOnlyCss ? `@media print{${printOnlyCss}}` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>${head}
  <style>${baseStyle}${css}${printStyle}${buildPageCss({ size: pageSize })}</style>
  </head><body>${body}${buildAutoPrintScript(autoPrint)}</body></html>`;
}
