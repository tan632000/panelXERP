"use client";

import React from "react";

interface ListCountProps {
  /**
   * The whole sentence, already translated and interpolated by the caller.
   *
   * A node rather than only a string because a list whose counts carry meaning — overdue,
   * due soon — colours those figures inside the line, the way the count reads on the
   * customer's own screens.
   */
  label: React.ReactNode;
  /** Distinguishes the three lines when a test needs to point at one of them. */
  testId?: string;
}

/**
 * The line above a table saying how much the current filters selected.
 *
 * It sits above the table rather than in the pagination footer because it answers a different
 * question: not "which page am I on" but "did my filters match anything, and how much". A
 * reader who has just changed a filter wants that before the rows, not after them.
 *
 * `xlbm` was the first screen to draw one by hand; this is the same line, shared.
 */
export function ListCount({ label, testId }: Readonly<ListCountProps>) {
  return (
    <div className="mb-2 px-1 text-xs text-text-secondary" data-testid={testId}>
      {label}
    </div>
  );
}
