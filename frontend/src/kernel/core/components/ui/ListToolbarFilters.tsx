"use client";

import { useTranslations } from "next-intl";
import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import { toIsoDate } from "@/kernel/core/lib/date-picker-utils";

/** What a filter control tells its toolbar: whether it narrows the list, and how to undo it. */
export interface ToolbarFilterEntry {
  active: boolean;
  reset?: () => void;
  /** Present on a date range: fills it from a quick-range chip. */
  setRange?: (from: string, to: string) => void;
  /** What the filter holds, as the chip that stands for it while the panel is closed. */
  chip?: string;
}

interface ToolbarFiltersContextValue {
  /**
   * Where a filter renders: the panel grid, `null` to stay inline (no panel — the test DOM),
   * or `undefined` while the panel is still mounting, when a filter renders nothing so it
   * never flashes in the row first.
   */
  target: HTMLElement | null | undefined;
  upsert: (id: string, entry: ToolbarFilterEntry) => void;
  remove: (id: string) => void;
}

/** The "Filters" button's state, for the keyword box that draws it beside itself. */
export interface FilterToggleState {
  open: boolean;
  activeCount: number;
  onToggle: () => void;
}

const ToolbarFiltersContext = createContext<ToolbarFiltersContextValue | null>(
  null,
);

/**
 * Kept apart from the registry: the button's count changes as filters register, and a
 * registry that changed with it would make every filter unregister and register again.
 */
const FilterToggleContext = createContext<FilterToggleState | null>(null);

/**
 * Registers a filter control with the enclosing `ListToolbar` and returns where it renders —
 * see `ToolbarFiltersContextValue.target`. Outside a toolbar a control always renders inline.
 */
export function useToolbarFilterSlot(
  entry: ToolbarFilterEntry,
  enabled = true,
): HTMLElement | null | undefined {
  const toolbar = useContext(ToolbarFiltersContext);
  const ctx = enabled ? toolbar : null;
  const id = useId();
  const entryRef = useRef(entry);
  useLayoutEffect(() => {
    entryRef.current = entry;
  });

  useEffect(() => {
    if (!ctx) return;
    // Callbacks go through the ref, so a reset always reaches the latest `onChange`.
    ctx.upsert(id, {
      active: entry.active,
      reset: entry.reset ? () => entryRef.current.reset?.() : undefined,
      setRange: entry.setRange
        ? (from, to) => entryRef.current.setRange?.(from, to)
        : undefined,
      chip: entry.chip,
    });
  });
  useEffect(() => {
    if (!ctx) return;
    return () => ctx.remove(id);
  }, [ctx, id]);

  return ctx ? ctx.target : null;
}

/**
 * Keeps the controls inside a composite filter — the two dates of a range — from each moving
 * into the panel on their own: the composite moves as one.
 */
export function ToolbarFilterPart({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ToolbarFiltersContext.Provider value={null}>
      {children}
    </ToolbarFiltersContext.Provider>
  );
}

/** The "Filters" button of the enclosing toolbar, or null where it has no panel. */
export function useFilterToggle(): FilterToggleState | null {
  return useContext(FilterToggleContext);
}

/**
 * The caption of a filter, read from its clear entry: "All statuses" → "Statuses",
 * "Status: All" → "Status", and the same two shapes of the Vietnamese copy. An entry that
 * already names its axis ("Category") is the caption itself; a bare "All" names nothing.
 */
export function deriveFilterLabel(
  clearLabel: string | undefined,
): string | null {
  const text = clearLabel?.trim();
  if (!text) return null;
  const suffix = /^(.+?)\s*:\s*(tất cả|all)$/i.exec(text);
  const prefix = /^(?:tất cả|all)\s+(?:các\s+)?(.+)$/i.exec(text);
  // A bare "All" names no axis: such a field passes `filterLabel` instead.
  const bareAll = /^(?:tất cả|all)$/i.test(text);
  const axis = suffix?.[1] ?? prefix?.[1] ?? (bareAll ? null : text);
  if (!axis) return null;
  return axis.charAt(0).toUpperCase() + axis.slice(1);
}

/** One captioned cell of the panel grid. */
export function FilterField({
  label,
  wide = false,
  last = false,
  children,
}: Readonly<{
  label: string | null;
  wide?: boolean;
  /** Drawn after every other field, whatever order the fields portaled into the panel. */
  last?: boolean;
  children: React.ReactNode;
}>) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        wide && "col-span-2",
        last && "order-last",
      )}
    >
      {/* An uncaptioned field keeps the caption's line, so the panel's fields stay level. */}
      <span
        className="truncate text-xs font-medium text-text-secondary"
        aria-hidden={label ? undefined : true}
      >
        {label ?? "\u00a0"}
      </span>
      {children}
    </div>
  );
}

/** Portals a filter into the panel, or draws it in place when there is none. */
export function renderInToolbarSlot(
  slot: HTMLElement | null | undefined,
  field: React.ReactNode,
  inline: React.ReactNode,
): React.ReactNode {
  if (slot === undefined) return null;
  if (slot === null) return inline;
  return createPortal(field, slot);
}

function quickRanges(): Array<{ key: string; from: string; to: string }> {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const weekAgo = new Date(y, m, today.getDate() - 6);
  return [
    { key: "last7Days", from: toIsoDate(weekAgo), to: toIsoDate(today) },
    {
      key: "thisMonth",
      from: toIsoDate(new Date(y, m, 1)),
      to: toIsoDate(new Date(y, m + 1, 0)),
    },
    {
      key: "lastMonth",
      from: toIsoDate(new Date(y, m - 1, 1)),
      to: toIsoDate(new Date(y, m, 0)),
    },
  ];
}

interface Summary {
  count: number;
  activeCount: number;
  hasRange: boolean;
  chips: Array<{ id: string; text: string }>;
}

const EMPTY_SUMMARY: Summary = {
  count: 0,
  activeCount: 0,
  hasRange: false,
  chips: [],
};

/** Tailwind `lg`: a desktop opens the panel under the toolbar, a smaller screen a bottom sheet. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const summaryKey = (summary: Summary) =>
  JSON.stringify([
    summary.count,
    summary.activeCount,
    summary.hasRange,
    summary.chips,
  ]);

/**
 * The filter panel of a list toolbar. The screen's filter dropdowns and date range portal
 * into its grid wherever the screen placed them, so every list gets the same panel without
 * restating its filters; the row above keeps the keyword box, the "Filters" button and the
 * actions. Every list does this however few its filters, so all toolbars read the same.
 */
export function useToolbarFilters() {
  const t = useTranslations("common");
  const [mode, setMode] = useState<"pending" | "panel" | "inline">("pending");
  const [desktop, setDesktop] = useState(false);
  // The filters register in their own effects, which run before this toolbar's: until then the
  // count is unknown, and a filter drawn in the row could jump into the panel a frame later.
  const [settled, setSettled] = useState(false);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const entries = useRef(new Map<string, ToolbarFilterEntry>());
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);

  // The test DOM has no `matchMedia`: there the filters stay inline, as they render on a page
  // without this panel. The mode is read from the window once mounted, which is what these
  // state updates in effects are for.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setMode("inline");
      return;
    }
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(query.matches);
    sync();
    setMode("panel");
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => setSettled(true), []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const ctx = useMemo<ToolbarFiltersContextValue>(() => {
    const refresh = () => {
      const all = [...entries.current.entries()];
      const next: Summary = {
        count: all.length,
        activeCount: all.filter(([, entry]) => entry.active).length,
        hasRange: all.some(([, entry]) => entry.setRange),
        chips: all.flatMap(([id, entry]) =>
          entry.active && entry.chip ? [{ id, text: entry.chip }] : [],
        ),
      };
      setSummary((prev) =>
        summaryKey(prev) === summaryKey(next) ? prev : next,
      );
    };
    let target: HTMLElement | null | undefined;
    if (mode === "inline") {
      target = null;
    } else if (mode === "panel" && settled && grid) target = grid;
    return {
      target,
      upsert: (id, entry) => {
        entries.current.set(id, entry);
        refresh();
      },
      remove: (id) => {
        entries.current.delete(id);
        refresh();
      },
    };
  }, [mode, settled, grid]);

  const toggle = useMemo<FilterToggleState | null>(
    () =>
      mode === "panel" && settled && summary.count > 0
        ? {
            open,
            activeCount: summary.activeCount,
            onToggle: () => setOpen((value) => !value),
          }
        : null,
    [mode, settled, summary, open],
  );

  const resetAll = () =>
    entries.current.forEach((entry) => {
      entry.reset?.();
    });

  const applyRange = (from: string, to: string) => {
    for (const entry of entries.current.values()) {
      if (entry.setRange) {
        entry.setRange(from, to);
        return;
      }
    }
  };

  // A phone shows the filters as a bottom sheet over the list; Escape closes it like a dialog.
  const sheetOpen = mode === "panel" && !desktop && open;
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const resetButton = (
    <button
      type="button"
      onClick={resetAll}
      className="cursor-pointer text-xs font-medium text-brand hover:underline [font-family:inherit]"
    >
      {t("resetFilters")}
    </button>
  );

  const quickRangeChips = summary.hasRange ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-text-tertiary">{t("quickRange")}</span>
      {quickRanges().map((range) => (
        <button
          key={range.key}
          type="button"
          onClick={() => applyRange(range.from, range.to)}
          className="cursor-pointer rounded-full border border-border-secondary bg-surface-primary px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-brand/40 hover:text-brand max-lg:px-3 max-lg:py-1.5 [font-family:inherit]"
        >
          {t(range.key)}
        </button>
      ))}
    </div>
  ) : null;

  const chips =
    !open && summary.chips.length > 0 ? (
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {summary.chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand/30 bg-brand-light py-0.5 pl-2.5 pr-1 text-xs text-brand"
          >
            <span className="truncate">{chip.text}</span>
            <button
              type="button"
              aria-label={t("clear")}
              onClick={() => entries.current.get(chip.id)?.reset?.()}
              className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-brand/10"
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        {resetButton}
      </div>
    ) : null;

  const visible = open && summary.count > 0;

  // Filters apply as they change, so the panel needs no confirm step: the "Filters" button
  // closes it, and a closed panel leaves a chip for each filter still narrowing the list.
  const inlinePanel = (
    <div
      className={cn(
        "mb-3 rounded-xl border border-border-secondary bg-surface-primary p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
        !visible && "hidden",
      )}
    >
      <div
        ref={setGrid}
        // A desktop keeps every cell at a readable width instead of stretching four over the row.
        className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-[repeat(auto-fill,minmax(220px,260px))]"
      />
      {summary.hasRange || summary.activeCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {quickRangeChips}
          {summary.activeCount > 0 ? (
            <div className="ml-auto">{resetButton}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  // Kept mounted while closed: the filters portal into its grid and must stay there. Portaled to
  // the body so no transformed or clipping ancestor moves it, and below the dropdown menus
  // (z 110) and date pickers that open over it.
  const sheet = (
    <div
      hidden={!visible}
      className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/45"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("filters")}
        className="flex max-h-[85dvh] flex-col rounded-t-2xl bg-surface-primary pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(15,23,42,0.18)]"
      >
        <div className="relative flex items-center justify-between border-b border-border-secondary px-4 py-3">
          <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-border-primary" />
          <span className="text-base font-semibold text-text-primary">
            {t("filters")}
          </span>
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-surface-secondary"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div
            ref={setGrid}
            // One field a row; a date range keeps its two dates side by side.
            className="grid grid-cols-2 gap-x-3 gap-y-3 [&>*]:col-span-2"
          />
          {quickRangeChips ? (
            <div className="mt-3">{quickRangeChips}</div>
          ) : null}
        </div>
        <div className="flex gap-2 border-t border-border-secondary px-4 py-3">
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[7px] border border-border-secondary bg-surface-primary text-sm font-medium text-text-primary [font-family:inherit]"
          >
            {t("resetFilters")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[7px] border border-brand bg-brand text-sm font-semibold text-white [font-family:inherit]"
          >
            {t("showResults")}
          </button>
        </div>
      </div>
    </div>
  );

  const panel =
    mode === "panel" ? (
      <>
        {desktop ? inlinePanel : createPortal(sheet, document.body)}
        {chips}
      </>
    ) : null;

  return { registry: ctx, panel, toggle };
}

export function ToolbarFiltersProvider({
  registry,
  toggle,
  children,
}: Readonly<{
  registry: ToolbarFiltersContextValue;
  toggle: FilterToggleState | null;
  children: React.ReactNode;
}>) {
  return (
    <ToolbarFiltersContext.Provider value={registry}>
      <FilterToggleContext.Provider value={toggle}>
        {children}
      </FilterToggleContext.Provider>
    </ToolbarFiltersContext.Provider>
  );
}

/** The "Filters" button: captioned with a count and chevron, a bare icon on a phone. */
export function FilterToggleButton({
  toggle,
}: Readonly<{ toggle: FilterToggleState }>) {
  const t = useTranslations("common");
  return (
    <button
      type="button"
      aria-expanded={toggle.open}
      aria-label={t("filters")}
      onClick={toggle.onToggle}
      className={cn(
        "relative inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border px-3 text-sm font-medium transition-colors max-lg:size-10 max-lg:px-0 [font-family:inherit]",
        toggle.open || toggle.activeCount > 0
          ? "border-brand/40 bg-brand-light text-brand"
          : "border-border-secondary bg-surface-primary text-text-secondary hover:border-border-primary hover:text-text-primary",
      )}
    >
      <Icon name="adjustments-horizontal" size={16} />
      <span className="max-lg:hidden">{t("filters")}</span>
      {toggle.activeCount > 0 ? (
        // A phone pins the count to the icon's corner.
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-none text-white max-lg:absolute max-lg:-right-1.5 max-lg:-top-1.5">
          {toggle.activeCount}
        </span>
      ) : null}
      <Icon
        name="chevron-down"
        size={14}
        className={cn(
          "transition-transform duration-150 max-lg:hidden",
          toggle.open && "rotate-180",
        )}
      />
    </button>
  );
}
