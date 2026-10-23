"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/kernel/core/components/ui/Button";

interface ErrorStateProps {
  message?: string;
  /**
   * Retry handler. When given, the state offers a button instead of leaving the reader with a
   * dead end — a failed list must not look like an empty one, and re-running the query is the
   * only thing they can usefully do about it.
   */
  onRetry?: () => void;
  /** Centres the state in the space a table would have filled, for a whole-list failure. */
  bordered?: boolean;
}

export function ErrorState({
  message,
  onRetry,
  bordered = false,
}: Readonly<ErrorStateProps>) {
  const t = useTranslations("common");

  const body = (
    <>
      <p className="text-sm text-danger-text">{message ?? t("loadError")}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </>
  );

  if (!bordered) return body;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-primary px-6 py-12">
      {body}
    </div>
  );
}
