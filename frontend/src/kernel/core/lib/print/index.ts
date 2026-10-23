/**
 * Shared print toolkit — replaces the hand-rolled HTML every PDF-print/stamp util in the app
 * used to write from scratch. Reference style: `sales/quotation/utils/print-quotation-file.ts`
 * and `warehouse/_shared/utils/print-warehouse-slip.ts`, both migrated onto this toolkit.
 *
 * Migration guide — which helper replaces which duplicated snippet:
 *
 * - `function escapeHtml(value) {...}` repeated in every util
 *   -> `html.ts`'s `escapeHtml`.
 * - `const EMPTY = "—"` / `function text(value)` / `function slipText(value)` blank-value helpers
 *   -> `html.ts`'s `textOrDash`.
 * - `const HP_LOGO_SRC = typeof hpLogo === "string" ? hpLogo : hpLogo.src;` / an `hp-logo.jpg` import
 *   -> `brand-logo.ts`'s `BRAND_LOGO_SRC` (the configured customer logo).
 * - `font-family:"Times New Roman",Times,serif` / `font-family:Arial,Helvetica,sans-serif`
 *   literals
 *   -> `fonts.ts`'s `DOCUMENT_FONT_FAMILY` / `STAMP_FONT_FAMILY`.
 * - The mock's `_hpPrintHeaderHTML` letterhead (logo left, border-bottom) and the quotation's own
 *   text-left/logo-right header
 *   -> `letterhead.ts`'s `buildHpLetterhead(labels, { variant })`.
 * - The `<!DOCTYPE html>...<style>...window.onload=()=>{window.print();}` document shell every
 *   util built by template-literal concatenation, plus any one-off `@media print{...}` tweak and
 *   `@page{...}` rule
 *   -> `document.ts`'s `buildPrintDocument({ title, css, body, font, autoPrint, pageSize,
 *      pageMarginMm, printOnlyCss })`. It always forces a zero-margin `@page` (see `page-css.ts`)
 *      so the browser's own print header/footer (date/time, title, URL, page numbers) never
 *      renders; the document's visual margin is `pageMarginMm` of body padding instead.
 * - A React layout printed with `window.print()` on the app page, or portaled onto `body` with
 *   `data-print-mode` + named `@page` rules
 *   -> `components/print/PrintSheet.tsx`'s `<PrintSheet ref>` + `usePrintSheet({ title, pageSize })`,
 *      which copies the sheet and the app styles into this same `buildPrintDocument` popup
 *      (`print-element.ts`). Every print in the app goes through one popup shell.
 * - `window.open("", "_blank", "widthX,heightY")` + `popup.document.write(...)` +
 *   `popup.document.close()` + the `if (!popup) ...` blocked-popup branch
 *   -> `print-window.ts`'s `openPrintWindow` / `writePrintDocument` / `printHtml`, and the
 *      `usePrintHtml` hook (`kernel/core/hooks/usePrintHtml.ts`) for the toast-on-blocked case.
 * - The mock's `_qcPFSignHTML` / `_pfBlankSignHTML` two-signer (or single-signer Lab) signature
 *   grid, with its electronic-signature variant
 *   -> `sign-block.ts`'s `buildSignBlock(signers, { signedLabel, blankPlaceholder,
 *      leadingBlankColumns })`.
 *
 * - The mock's `_temTPCanvas` / `_temTPPrintStamps` 70x80mm Tem TP stamp (header + info rows +
 *   bottom block + QR, canvas draw and HTML body, screen toolbar, page CSS) duplicated between
 *   the warehouse box label and the packaging product label
 *   -> `stamp.ts`'s `drawStampCanvas` / `stampBodyHtml` / `buildStampPrintHtml`. The much
 *      simpler borderless calibration tag (no QR/logo) keeps its own drawing code — reusing this
 *      toolkit's `jpeg-pdf.ts` and `download-blob.ts` already removes the duplication it shared
 *      with the two Tem TP files.
 */

export { escapeHtml, textOrDash } from "@/kernel/core/lib/print/html";
export { BRAND_LOGO_SRC } from "@/kernel/core/lib/print/brand-logo";
export {
  DOCUMENT_FONT_FAMILY,
  STAMP_FONT_FAMILY,
} from "@/kernel/core/lib/print/fonts";
export {
  NO_BROWSER_HEADER_FOOTER_CSS,
  buildPageCss,
  type PageCssOptions,
} from "@/kernel/core/lib/print/page-css";
export {
  buildHpLetterhead,
  type HpLetterheadLabels,
  type HpLetterheadOptions,
  type HpLetterheadVariant,
} from "@/kernel/core/lib/print/letterhead";
export {
  buildPrintDocument,
  type PrintDocumentAutoPrint,
  type PrintDocumentFont,
  type PrintDocumentOptions,
} from "@/kernel/core/lib/print/document";
export {
  buildElementPrintHtml,
  type PrintElementOptions,
} from "@/kernel/core/lib/print/print-element";
export {
  openPrintWindow,
  printHtml,
  writePrintDocument,
} from "@/kernel/core/lib/print/print-window";
export {
  buildSignBlock,
  type SignBlockOptions,
  type SignBoxSigner,
} from "@/kernel/core/lib/print/sign-block";
export {
  buildStampPrintHtml,
  drawStampCanvas,
  runStampDownload,
  STAMP_SIZE_MM,
  stampBodyHtml,
  stampPopupFeatures,
  type StampBottomRow,
  type StampContent,
  type StampDownloadStatusCaptions,
  type StampInfoRow,
  type StampLetterheadCaptions,
  type StampToolbarCaptions,
} from "@/kernel/core/lib/print/stamp";
