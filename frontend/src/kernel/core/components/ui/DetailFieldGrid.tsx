"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

/** 2 = compact (side panels), 3 = wide detail pages. */
export type DetailFieldGridColumns = 2 | 3;

export interface DetailFieldGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: DetailFieldGridColumns;
}

const COLUMN_CLASS: Record<DetailFieldGridColumns, string> = {
  2: "grid-cols-2 gap-x-4 gap-y-4",
  3: "grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3",
};

export function DetailFieldGrid({
  children,
  className,
  columns = 2,
}: DetailFieldGridProps) {
  return (
    <div className={cn("grid", COLUMN_CLASS[columns], className)}>
      {children}
    </div>
  );
}
