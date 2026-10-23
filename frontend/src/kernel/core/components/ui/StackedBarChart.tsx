"use client";

import React from "react";

import { cn } from "@/kernel/core/lib/cn";

export interface StackedBarChartSegment {
  value: number;
  /** Tailwind background class for the segment. Ignored if `color` is set. */
  colorClass?: string;
  /** Inline color (hex/rgb) for the segment, when a fixed hex is required. */
  color?: string;
  /** Text shown in the segment's tooltip, e.g. `Domestic: 120M`. */
  tooltip?: string;
}

export interface StackedBarChartBar {
  /** Label printed under the bar, e.g. `T1/2026`. */
  label: string;
  segments: StackedBarChartSegment[];
}

export interface StackedBarChartProps {
  data: StackedBarChartBar[];
  /** Formats the total shown above a bar. Defaults to a plain string conversion. */
  formatValue?: (value: number) => string;
  className?: string;
  /** Shorter bars and labels, for a chart that sits in a multi-column grid. */
  compact?: boolean;
}

const BAR_MAX_HEIGHT_PX = 180;

/**
 * A generic, feature-agnostic vertical stacked-bar chart drawn with plain flex/CSS — no chart
 * library dependency. Colors, labels and value formatting all arrive as props; this component
 * carries no business vocabulary.
 */
export function StackedBarChart({
  data,
  formatValue = (value) => String(value),
  className,
  compact = false,
}: Readonly<StackedBarChartProps>) {
  const barHeight = compact ? 96 : BAR_MAX_HEIGHT_PX;
  const maxTotal = Math.max(
    1,
    ...data.map((bar) =>
      bar.segments.reduce((sum, segment) => sum + segment.value, 0),
    ),
  );

  return (
    <div
      className={cn(
        "flex items-end gap-3 overflow-x-auto px-2 pb-1",
        className,
      )}
    >
      {data.map((bar, index) => {
        const total = bar.segments.reduce((sum, s) => sum + s.value, 0);
        return (
          <div
            key={`${bar.label}-${index}`}
            className={cn(
              "flex flex-1 flex-col items-center",
              compact ? "min-w-0 gap-0.5" : "min-w-[48px] gap-1.5",
            )}
          >
            <div
              className={cn(
                "font-semibold tabular-nums text-text-primary",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {total > 0 ? formatValue(total) : " "}
            </div>
            <div
              className="flex w-full max-w-[52px] flex-col-reverse overflow-hidden rounded-t-sm bg-surface-secondary"
              style={{ height: barHeight }}
            >
              {bar.segments.map((segment, segIndex) => {
                const heightPx =
                  total > 0 ? (segment.value / maxTotal) * barHeight : 0;
                if (heightPx <= 0) return null;
                return (
                  <div
                    key={segIndex}
                    title={segment.tooltip}
                    className={cn("w-full", segment.colorClass)}
                    style={{
                      height: heightPx,
                      backgroundColor: segment.color,
                    }}
                  />
                );
              })}
            </div>
            <div
              className={cn(
                "text-text-secondary",
                compact ? "text-[10px]" : "text-[11px] whitespace-nowrap",
              )}
            >
              {bar.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
