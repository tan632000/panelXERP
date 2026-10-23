"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

/**
 * How far along the bar reads: barely started, still running, or all the way there. `early`
 * exists for a caller that wants a 3-tier read (e.g. under 50%) — it is never auto-derived, so
 * an existing 2-tone caller's colors stay exactly as they were.
 */
export type ProgressBarTone = "progress" | "complete" | "early";

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped rather than overflowing the track. */
  percent: number;
  /**
   * Colour of the filled part. Defaults to deriving it from `percent`, which is what a plain
   * "how much of this is done" bar wants; pass it explicitly to hold a colour steady.
   */
  tone?: ProgressBarTone;
  className?: string;
  /**
   * Colour of the filled part, as a class — for a scale the three tones cannot express.
   * Overrides `tone`.
   *
   * Production completion is the case this exists for: it reads past 100% and colours
   * over-production on its own scale, which is not what "how far along is this document"
   * means anywhere else, so the scale stays with the feature that owns it instead of adding
   * tones every other caller would have to ignore.
   */
  fillClassName?: string;
  /** Describes what is being measured, for readers who cannot see the bar. */
  ariaLabel?: string;
}

const TONE_CLASS: Record<ProgressBarTone, string> = {
  early: "bg-warning-text",
  progress: "bg-info-text",
  complete: "bg-success-text",
};

/**
 * A single horizontal completion bar.
 *
 * Lives in the kernel because "how far along is this document" is not one feature's idea — a
 * plan's receipt progress, an order's fulfilment and a production run all draw the same bar,
 * and a private copy per feature would drift in height and colour.
 */
export function ProgressBar({
  percent,
  tone,
  className,
  fillClassName,
  ariaLabel,
}: Readonly<ProgressBarProps>) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  const resolvedTone: ProgressBarTone =
    tone ?? (clamped >= 100 ? "complete" : "progress");

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded bg-surface-secondary",
        className,
      )}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded transition-[width] duration-300",
          fillClassName ?? TONE_CLASS[resolvedTone],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
