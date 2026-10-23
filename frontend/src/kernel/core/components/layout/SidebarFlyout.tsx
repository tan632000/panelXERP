"use client";

import { useTranslations } from "next-intl";
import React, { useLayoutEffect, useRef, useState } from "react";

import { SidebarPinButton } from "@/kernel/core/components/layout/SidebarParts";
import { cn } from "@/kernel/core/lib/cn";
import { Link } from "@/kernel/i18n/navigation";

import type { SidebarNavGroup } from "@/kernel/core/components/layout/sidebar-nav";

const VIEWPORT_MARGIN = 8;

export interface SidebarFlyoutProps {
  group: SidebarNavGroup;
  /** Viewport x of the flyout's left edge: just past the sidebar. */
  left: number;
  /** Viewport y of the module row it opened from; the flyout lines up with it. */
  anchorTop: number;
  isPinned: (href: string) => boolean;
  onTogglePin: (href: string) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onNavigate: () => void;
  /** Lets the sidebar tell a click inside the flyout from one outside both. */
  flyoutRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * A module's functions, opened beside the sidebar from its row. Fixed to the viewport so the
 * sidebar's scroll box does not clip it, and pulled up when the row sits near the bottom.
 */
export function SidebarFlyout({
  group,
  left,
  anchorTop,
  isPinned,
  onTogglePin,
  onPointerEnter,
  onPointerLeave,
  onNavigate,
  flyoutRef,
}: SidebarFlyoutProps) {
  const t = useTranslations("common");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(anchorTop);

  useLayoutEffect(() => {
    const height = boxRef.current?.offsetHeight ?? 0;
    const max = window.innerHeight - height - VIEWPORT_MARGIN;
    setTop(Math.max(VIEWPORT_MARGIN, Math.min(anchorTop - 10, max)));
  }, [anchorTop, group.key]);

  const setRefs = (node: HTMLDivElement | null) => {
    boxRef.current = node;
    flyoutRef.current = node;
  };

  return (
    <div
      ref={setRefs}
      role="menu"
      aria-label={group.title}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      style={{ left, top }}
      className="fixed z-[90] w-[300px] rounded-[14px] border border-border-secondary bg-surface-primary p-2.5 shadow-[0_16px_40px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.06)]"
    >
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1.5">
        <span className="text-[15px] font-bold text-brand">{group.title}</span>
        <span className="text-xs text-text-secondary">
          {t("sidebarFunctionCount", { count: group.items.length })}
        </span>
      </div>
      <div className="flex flex-col gap-px">
        {group.items.map((entry) => (
          <div
            key={entry.href}
            className={cn(
              "flex items-center rounded-[9px] pl-3",
              entry.active
                ? "bg-brand-light text-brand"
                : "text-text-primary hover:bg-surface-secondary",
            )}
          >
            <Link
              href={entry.href}
              role="menuitem"
              onClick={onNavigate}
              className={cn(
                "flex min-h-10 min-w-0 flex-1 items-center text-sm text-inherit no-underline",
                entry.active && "font-semibold",
              )}
            >
              {entry.label}
            </Link>
            <SidebarPinButton
              entry={entry}
              pinned={isPinned(entry.href)}
              onToggle={onTogglePin}
              tone="light"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
