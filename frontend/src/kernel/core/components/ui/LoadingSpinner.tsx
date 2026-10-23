"use client";

import { cn } from "@/kernel/core/lib/cn";

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

export function LoadingSpinner({
  size = 20,
  className,
}: Readonly<LoadingSpinnerProps>) {
  return (
    <span
      role="status"
      aria-hidden
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-border-primary border-t-brand",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
