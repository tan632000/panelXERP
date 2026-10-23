"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

export interface DetailFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  valueClassName?: string;
  /** Span exactly 2 tracks — for 2-column grids. */
  span2?: boolean;
  /** Span every track, whatever the column count — for 3-column detail pages. */
  spanFull?: boolean;
}

export function DetailField({
  label,
  children,
  className,
  valueClassName,
  span2 = false,
  spanFull = false,
}: DetailFieldProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        span2 && !spanFull && "col-span-2",
        spanFull && "col-span-full",
        className,
      )}
    >
      <span className="text-[13px] font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <div
        className={cn(
          "text-[15px] font-medium text-text-primary break-words",
          valueClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
