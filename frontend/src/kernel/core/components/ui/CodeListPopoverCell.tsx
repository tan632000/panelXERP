"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  CODE_LIST_POPOVER_Z_INDEX,
  resolveCodeListBadgeCount,
  resolveCodeListPopoverPosition,
  type CodeListPopoverItem,
  type CodeListPopoverPosition,
} from "@/kernel/core/lib/code-list-popover";

const CODE_LIST_POPOVER_CLOSE_DELAY_MS = 120;

interface CodeListPopoverCellProps {
  items: CodeListPopoverItem[];
  empty: string;
  popoverTitle: string;
  badgeLabel: (count: number) => string;
  labelHeader: string;
}

/**
 * A list cell that shows the first code and discloses the rest — each with the name that
 * identifies it — on hover or activation, closing when focus leaves it or Escape is
 * pressed. The popover is portaled to document.body so a Table's overflow-x-auto can
 * neither clip it nor stretch the last row.
 */
export function CodeListPopoverCell({
  items,
  empty,
  popoverTitle,
  badgeLabel,
  labelHeader,
}: Readonly<CodeListPopoverCellProps>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CodeListPopoverPosition | null>(
    null,
  );
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const extraCount = resolveCodeListBadgeCount(items.map((item) => item.code));
  const firstCode = items[0]?.code || empty;

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPosition(null);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      resolveCodeListPopoverPosition(rect, items.length, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [items.length]);

  const openPopover = useCallback(() => {
    cancelClose();
    updatePosition();
    setOpen(true);
  }, [cancelClose, updatePosition]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(
      close,
      CODE_LIST_POPOVER_CLOSE_DELAY_MS,
    );
  }, [cancelClose, close]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [close, open, updatePosition]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  if (extraCount === 0) {
    return (
      <span className="font-mono font-semibold text-text-primary">
        {firstCode}
      </span>
    );
  }

  return (
    <div
      ref={triggerRef}
      className="flex items-center gap-1"
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (triggerRef.current?.contains(next)) return;
        if (popoverRef.current?.contains(next)) return;
        close();
      }}
    >
      <span className="font-mono font-semibold text-text-primary">
        {firstCode}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-label={popoverTitle}
        className="cursor-pointer rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700"
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            close();
            return;
          }
          openPopover();
        }}
      >
        {badgeLabel(extraCount)}
      </button>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={popoverTitle}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                zIndex: CODE_LIST_POPOVER_Z_INDEX,
                transform:
                  position.placement === "top"
                    ? "translateY(-100%)"
                    : undefined,
              }}
              className="min-w-[220px] cursor-default rounded-lg border border-border-secondary bg-surface-primary p-2 text-left shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
              onMouseEnter={openPopover}
              onMouseLeave={scheduleClose}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
                {popoverTitle}
              </div>
              <ul className="flex flex-col gap-1">
                {items.map((item, index) => (
                  <li
                    key={`${item.code}-${index}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-mono font-semibold text-text-primary">
                      {item.code}
                    </span>
                    <span className="text-text-secondary" title={labelHeader}>
                      {item.label || empty}
                    </span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
