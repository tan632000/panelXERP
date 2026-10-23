"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

export interface DetailNoteBoxProps {
  children: React.ReactNode;
  className?: string;
}

/** Free-text note rendered as plain prose — no surface fill, no accent color. */
export function DetailNoteBox({ children, className }: DetailNoteBoxProps) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-text-primary whitespace-pre-line",
        className,
      )}
    >
      {children}
    </div>
  );
}
