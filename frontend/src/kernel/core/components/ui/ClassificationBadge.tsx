"use client";

import React from "react";

import { cn } from "@/kernel/core/lib/cn";

export interface ClassificationBadgeProps {
  label: string;
  colorClass: string;
  className?: string;
}

/** Shared pill badge for master-data classification enums. */
export function ClassificationBadge({
  label,
  colorClass,
  className,
}: ClassificationBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        colorClass,
        className,
      )}
      aria-label={label}
    >
      {label}
    </span>
  );
}
