"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { usePortalContainer } from "@/kernel/core/hooks/usePortalContainer";
import { cn } from "@/kernel/core/lib/cn";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "default";
  icon?: string;
  /** Disables both controls while the confirmed action is in flight. */
  pending?: boolean;
  /**
   * Disables confirm alone, leaving cancel reachable. For a dialog whose confirmation is
   * conditional on something the reader still has to supply — a required reason — where
   * reusing `pending` would trap them behind two disabled buttons.
   */
  confirmDisabled?: boolean;
  /**
   * Extra content between the description and the buttons: the input a conditional
   * confirmation needs. Left out, the dialog is the plain yes/no it has always been.
   */
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = "danger",
  icon,
  pending = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  /**
   * One opening of the dialog confirms at most once.
   *
   * The handler behind `onConfirm` is synchronous and usually closes the dialog only in
   * `onSettled`, so a second click during the request would fire a second delete; the
   * duplicate then fails as not-found and reports an error for a delete that succeeded.
   */
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!open) confirmedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel, pending]);

  // Rendered into the body so an overlay opened from inside a modal is not nested in that
  // modal's form, where its confirm button would belong to the form behind it.
  const container = usePortalContainer();

  const handleConfirm = useCallback(() => {
    if (confirmedRef.current || pending || confirmDisabled) return;
    confirmedRef.current = true;
    onConfirm();
  }, [confirmDisabled, onConfirm, pending]);

  if (!open || !container) return null;

  const isDanger = variant === "danger";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-[400px] max-w-[92vw] overflow-hidden rounded-2xl border border-border-secondary bg-surface-primary shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
      >
        <div className="flex flex-col items-center px-6 pb-2 pt-7 text-center">
          <div
            className={cn(
              "mb-4 flex h-12 w-12 items-center justify-center rounded-full ring-8",
              isDanger
                ? "bg-danger-bg text-danger-text ring-danger-bg/40"
                : "bg-brand-light text-brand ring-brand-light/50",
            )}
          >
            <Icon name={icon ?? (isDanger ? "trash" : "alert")} size={22} />
          </div>

          <h2
            id="confirm-dialog-title"
            className="mb-2 text-base font-semibold tracking-tight text-text-primary"
          >
            {title}
          </h2>
          <p
            id="confirm-dialog-desc"
            className="max-w-[320px] text-[13px] leading-relaxed text-text-secondary"
          >
            {description}
          </p>
        </div>

        {children ? (
          <div className="px-6 pb-1 pt-4 text-left">{children}</div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-border-tertiary bg-surface-secondary/60 px-6 py-4">
          <button
            type="button"
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-secondary bg-surface-primary px-4 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm font-semibold shadow-sm transition-all disabled:cursor-default disabled:opacity-50 [font-family:inherit]",
              isDanger
                ? "border border-danger-text bg-danger-text text-white hover:brightness-110 active:brightness-95"
                : "border border-brand bg-brand text-white hover:bg-brand-hover",
            )}
            onClick={handleConfirm}
            disabled={pending || confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    container,
  );
}
