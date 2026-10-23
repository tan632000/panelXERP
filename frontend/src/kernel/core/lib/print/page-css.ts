/**
 * Browsers draw their own print header/footer — page title, `about:blank`/the current URL,
 * date/time, page numbers — inside the `@page` margin box. No printed document or stamp in this
 * app may show that chrome, so every print shell forces the `@page` margin to 0: with nothing
 * left to lay out in the margin box, the browser header/footer prints nothing. The document's
 * own visual margin moves into body/page padding instead (see `buildPrintDocument`'s
 * `pageMarginMm`), so the printable area looks the same as it would with a real page margin.
 */
export const NO_BROWSER_HEADER_FOOTER_CSS = "@page{margin:0}";

export interface PageCssOptions {
  /** `@page` size — `"A4"`, `"A4 landscape"`, or a stamp's own physical size (`"70mm 80mm"`).
   * Omitted keeps the browser's default page size. */
  size?: string;
}

/**
 * The `@page` rule every print shell emits: the given size (if any) and an always-zero margin,
 * so the browser's own print header/footer never renders. `globals.css`'s named `@page` rules
 * for inline `PrintSheet` components should follow the same shape.
 */
export function buildPageCss(options: PageCssOptions = {}): string {
  const { size } = options;
  return size ? `@page{size:${size};margin:0}` : NO_BROWSER_HEADER_FOOTER_CSS;
}
