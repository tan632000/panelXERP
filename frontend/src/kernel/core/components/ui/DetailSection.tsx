"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

export interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Optional control rendered on the right, aligned with the title. */
  action?: React.ReactNode;
}

export function DetailSection({
  title,
  children,
  className,
  action,
}: DetailSectionProps) {
  return (
    <section className={cn("mb-6 last:mb-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-[15px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}
