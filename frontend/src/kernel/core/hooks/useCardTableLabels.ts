"use client";

import { useEffect } from "react";

import {
  alignCardCaptions,
  labelCardGrids,
  labelCardTables,
  widenOverflowingCells,
} from "@/kernel/core/lib/detail-table-cards";

import type React from "react";

/**
 * Keeps the hand-built `<table>`s under `rootRef` captioned for the card stylesheet while
 * `enabled` (see `labelCardTables`). Lines load, are added and change after the first paint,
 * so they are captioned again on every change; only attributes are written, which the
 * observer does not watch, so it cannot loop.
 */
export function useCardTableLabels(
  rootRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  shortActionLabel: (button: Element) => string | undefined,
  accepts?: (table: HTMLTableElement) => boolean,
  /** Also caption the `<div>` grid line editors (see `labelCardGrids`). */
  grids = false,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    let frame = 0;
    const label = () => {
      frame = 0;
      labelCardTables(root, shortActionLabel, accepts);
      if (grids) labelCardGrids(root);
      widenOverflowingCells(root);
      alignCardCaptions(root);
    };
    label();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(label);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef, enabled, shortActionLabel, accepts, grids]);
}
