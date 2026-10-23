"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

export interface DetailTextBlockProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailTextBlock({ children, className }: DetailTextBlockProps) {
  return (
    <p
      className={cn(
        "text-sm font-medium leading-relaxed text-text-primary whitespace-pre-line",
        className,
      )}
    >
      {children}
    </p>
  );
}
