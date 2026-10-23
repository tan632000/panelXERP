"use client";

import { useTranslations } from "next-intl";

import { LoadingSpinner } from "@/kernel/core/components/ui/LoadingSpinner";

interface LoadingStateProps {
  label?: string;
  variant?: "inline" | "list" | "fullscreen" | "overlay";
  showLabel?: boolean;
}

export function LoadingState({
  label,
  variant = "inline",
  showLabel = false,
}: Readonly<LoadingStateProps>) {
  const t = useTranslations("common");
  const text = label ?? t("loading");

  if (variant === "fullscreen") {
    return (
      <div
        className="flex h-screen w-full items-center justify-center bg-surface-tertiary"
        role="status"
        aria-live="polite"
        aria-label={text}
      >
        <LoadingSpinner size={28} />
      </div>
    );
  }

  if (variant === "overlay") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-surface-tertiary"
        role="status"
        aria-live="polite"
        aria-label={text}
      >
        <LoadingSpinner size={28} />
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div
        className="flex flex-col items-center justify-center px-5 py-10 text-text-secondary"
        role="status"
        aria-live="polite"
        aria-label={text}
      >
        <LoadingSpinner size={24} />
        {showLabel ? <p className="mt-3 text-sm">{text}</p> : null}
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 text-sm text-text-secondary"
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <LoadingSpinner size={16} />
      {showLabel ? <span>{text}</span> : null}
    </div>
  );
}
