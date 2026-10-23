"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import { Link } from "@/kernel/i18n/navigation";

import type {
  SidebarNavEntry,
  SidebarSearchHit,
} from "@/kernel/core/components/layout/sidebar-nav";

/** A section heading on the navy sidebar ("Pinned", "Modules"). */
/** A pinned function's pin is amber; an unpinned one is muted for the surface it sits on. */
function pinButtonTone(pinned: boolean, tone: string | undefined): string {
  if (pinned) return "text-amber-500";
  if (tone === "light") return "text-text-tertiary hover:text-text-primary";
  return "text-white/45 hover:text-white";
}

export function SidebarHeading({
  icon,
  children,
}: Readonly<{ icon?: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-1.5 px-6 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-white/60">
      {icon && <Icon name={icon} size={13} />}
      {children}
    </div>
  );
}

/** Pins or unpins one function; filled when pinned. */
export function SidebarPinButton({
  entry,
  pinned,
  onToggle,
  tone,
}: Readonly<{
  entry: SidebarNavEntry;
  pinned: boolean;
  onToggle: (href: string) => void;
  /** `light` on the white flyout, `dark` on the navy drawer. */
  tone: "light" | "dark";
}>) {
  const t = useTranslations("common");
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={t(pinned ? "sidebarUnpin" : "sidebarPin", {
        label: entry.label,
      })}
      title={t(pinned ? "sidebarUnpin" : "sidebarPin", { label: entry.label })}
      onClick={() => onToggle(entry.href)}
      className={cn(
        "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0",
        pinButtonTone(pinned, tone),
      )}
    >
      <Icon name={pinned ? "pin-filled" : "pin"} size={17} />
    </button>
  );
}

/** The search box at the top of the expanded rail and the drawer. */
export function SidebarSearchField({
  value,
  onChange,
  onKeyDown,
  onFocus,
  inputRef,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}>) {
  const t = useTranslations("common");
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{t("sidebarSearchLabel")}</span>
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        placeholder={t("sidebarSearchPlaceholder")}
        className="h-10 w-full rounded-[9px] border border-white/15 bg-white/[0.07] pl-9 pr-3 text-base text-white outline-none placeholder:text-white/55 focus:border-sky-300 focus:bg-white/[0.12] lg:text-sm"
      />
    </label>
  );
}

/** Search hits with the matched run underlined, or a no-match line. */
export function SidebarSearchResults({
  query,
  hits,
  onNavigate,
}: Readonly<{
  query: string;
  hits: SidebarSearchHit[];
  onNavigate?: () => void;
}>) {
  const t = useTranslations("common");
  if (hits.length === 0) {
    return (
      <p className="m-0 px-6 py-4 text-sm leading-relaxed text-white/60">
        {t("sidebarNoMatch", { query: query.trim() })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-px py-1">
      {hits.map(({ entry, before, match, after }) => (
        <Link
          key={entry.href}
          href={entry.href}
          onClick={onNavigate}
          className={cn(
            "mx-2.5 flex min-h-11 items-center gap-3 rounded-[9px] px-3 py-2 text-sm no-underline",
            entry.active
              ? "bg-white font-semibold text-brand"
              : "text-white/90 hover:bg-white/10 hover:text-white",
          )}
        >
          <span className="min-w-0 flex-1">
            {before}
            <span className="font-bold underline decoration-sky-300 underline-offset-[3px]">
              {match}
            </span>
            {after}
          </span>
          <span
            className={cn(
              "shrink-0 text-xs",
              entry.active ? "text-text-secondary" : "text-white/55",
            )}
          >
            {entry.groupTitle}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** The user's pinned functions, or a hint on how to pin one. */
export function SidebarPinnedList({
  entries,
  onNavigate,
}: Readonly<{ entries: SidebarNavEntry[]; onNavigate?: () => void }>) {
  const t = useTranslations("common");
  if (entries.length === 0) {
    return (
      <p className="m-0 px-6 pb-2 pt-0.5 text-[13px] leading-snug text-white/55">
        {t("sidebarPinHint")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <Link
          key={entry.href}
          href={entry.href}
          onClick={onNavigate}
          className={cn(
            "mx-2.5 flex min-h-9 items-center gap-2.5 rounded-[9px] px-3 py-1.5 text-sm no-underline",
            entry.active
              ? "bg-white font-semibold text-brand"
              : "text-white/85 hover:bg-white/10 hover:text-white",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <span
            className={cn(
              "shrink-0 text-[11px] font-normal",
              entry.active ? "text-text-secondary" : "text-white/55",
            )}
          >
            {entry.groupTitle}
          </span>
        </Link>
      ))}
    </div>
  );
}
