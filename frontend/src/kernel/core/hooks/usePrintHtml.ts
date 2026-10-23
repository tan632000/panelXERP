"use client";

import { useCallback } from "react";

import { printHtml } from "@/kernel/core/lib/print/print-window";
import { toast } from "@/kernel/core/lib/toast";

/**
 * Prints `html` straight from a click, reporting a blocked popup instead of failing silently.
 * The kernel holds no i18n of its own, so the caller supplies the already-translated message.
 */
export function usePrintHtml(
  blockedMessage: string,
): (html: string, features?: string) => boolean {
  return useCallback(
    (html: string, features?: string) => {
      const printed = printHtml(html, features);
      if (!printed) toast.showError(blockedMessage);
      return printed;
    },
    [blockedMessage],
  );
}
