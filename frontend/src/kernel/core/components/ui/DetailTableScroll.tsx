"use client";

import React from "react";

import { HorizontalScrollArea } from "@/kernel/core/components/ui/HorizontalScrollArea";
import { cn } from "@/kernel/core/lib/cn";

interface DetailTableScrollProps {
  children: React.ReactNode;
  className?: string;
}

/** Horizontal scroll wrapper for wide read-only tables inside detail panels. */
export function DetailTableScroll({
  children,
  className,
}: DetailTableScrollProps) {
  return (
    <HorizontalScrollArea
      className={cn("-mx-1 overflow-x-auto pb-1 scrollbar-thin", className)}
    >
      {children}
    </HorizontalScrollArea>
  );
}
