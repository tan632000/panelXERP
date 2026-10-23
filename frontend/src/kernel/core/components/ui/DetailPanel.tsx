"use client";

import React from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

export interface DetailPanelProps {
  open: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

export function DetailPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
  headerActions,
  footer,
  wide = false,
}: DetailPanelProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed bottom-0 right-0 top-0 z-[90] flex flex-col overflow-hidden border-l border-border-secondary bg-surface-primary shadow-[-4px_0_20px_rgba(0,0,0,0.08)]",
        wide ? "w-[min(720px,100vw)]" : "w-[min(580px,100vw)]",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2.5 border-b border-border-secondary px-[18px] py-3.5">
        <div className="min-w-0">
          <div className="text-lg font-bold">{title}</div>
          {subtitle && (
            <div className="mt-0.5 text-sm text-text-secondary">{subtitle}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {headerActions}
          <button
            type="button"
            aria-label="Close"
            className="flex cursor-pointer border-none bg-transparent p-0 text-2xl leading-none text-text-secondary hover:text-text-primary"
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-[18px] py-4">
        {children}
      </div>
      {footer ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border-secondary px-3.5 py-2.5">
          {footer}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
