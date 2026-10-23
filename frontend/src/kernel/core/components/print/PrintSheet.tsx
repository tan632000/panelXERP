"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useRef } from "react";

import { usePrintHtml } from "@/kernel/core/hooks/usePrintHtml";
import { buildElementPrintHtml } from "@/kernel/core/lib/print/print-element";

import type { PrintElementOptions } from "@/kernel/core/lib/print/print-element";

/**
 * The one way an in-app React layout is printed: render it inside `<PrintSheet>` (never shown on
 * screen) and call the `print` from `usePrintSheet`. The sheet is copied into a popup built by
 * `buildPrintDocument`, like every other document — never `window.print()` on the app page.
 */
export const PrintSheet = React.forwardRef<
  HTMLDivElement,
  Readonly<{ children: React.ReactNode }>
>(function PrintSheet({ children }, ref) {
  return (
    <div ref={ref} hidden aria-hidden>
      {children}
    </div>
  );
});

/**
 * Pairs a `<PrintSheet ref={sheetRef}>` with its print action. `print` must run from the click
 * (or an effect committed by it) so the popup is not blocked; a blocked popup toasts.
 */
export function usePrintSheet(options: PrintElementOptions) {
  const t = useTranslations("common");
  const sheetRef = useRef<HTMLDivElement>(null);
  const printHtml = usePrintHtml(t("printPopupBlocked"));
  const { title, css, font, autoPrint, pageSize, pageMarginMm, printOnlyCss } =
    options;

  const print = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return false;
    return printHtml(
      buildElementPrintHtml(sheet, {
        title,
        css,
        font,
        autoPrint,
        pageSize,
        pageMarginMm,
        printOnlyCss,
      }),
    );
  }, [
    printHtml,
    title,
    css,
    font,
    autoPrint,
    pageSize,
    pageMarginMm,
    printOnlyCss,
  ]);

  return { sheetRef, print };
}
