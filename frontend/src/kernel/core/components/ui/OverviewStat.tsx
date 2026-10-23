import React from "react";

import { cn } from "@kernel/core/lib/cn";

export interface OverviewStatProps {
  label: string;
  value: React.ReactNode;
  /** Unit printed after the figure, small and unemphasised — `pcs`, `kg`, … */
  unit?: string;
  /** Colours the figure, e.g. by how far along the thing it measures is. */
  valueClassName?: string;
  /** Centred tiles read as a row of gauges; the default left edge reads as a form. */
  align?: "left" | "center";
}

/**
 * One figure in a detail screen's overview row.
 *
 * Lives in the kernel because the tiles in a single row can come from more than one plugin — a
 * customer's overview is filled by sales through a slot — and they have to look like one row.
 */
export function OverviewStat({
  label,
  value,
  unit,
  valueClassName,
  align = "left",
}: Readonly<OverviewStatProps>) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl bg-surface-secondary px-4 py-3.5",
        centered && "items-center text-center",
      )}
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-bold tabular-nums text-text-primary",
          valueClassName,
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-xs font-normal text-text-secondary">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
