"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@kernel/core/components/ui/Icon";
import { useColumnFilterValues } from "@kernel/core/hooks/api/useColumnFilterValues";
import { cn } from "@kernel/core/lib/cn";
import { toStoredValueSearch } from "@kernel/core/lib/table-column-filter";

import { includesFolded } from "@/kernel/core/lib/search-text";

import type {
  ActiveColumnFilter,
  TableColumnFilterSelections,
} from "@kernel/core/types/column-filter";

const POPOVER_WIDTH_PX = 250;
const POPOVER_MAX_HEIGHT_PX = 360;
const POPOVER_GAP_PX = 4;
const POPOVER_Z_INDEX = 600;
const LOAD_MORE_THRESHOLD_PX = 24;
/** How many values a label search pulls in on its own before it waits for the reader to scroll. */
const LABEL_SEARCH_MAX_VALUES = 1000;
/** Stable stand-in for `loadMore` on a local column, so the effect below does not re-run. */
const NO_OP = () => {};

interface PopoverPosition {
  top: number;
  left: number;
}

export interface TableColumnFilterProps {
  /** Column header text, used to label the trigger and the popover. */
  columnLabel: string;
  column: string;
  /** Column-values endpoint. Omit when `localValues` supplies the value list instead. */
  endpoint?: string;
  /**
   * Pre-computed, deduplication-free value list for a column whose data is already fully
   * loaded in the browser — skips the endpoint round trip entirely. Ignored when `endpoint`
   * is set.
   */
  localValues?: string[];
  /** Empty means the column is unfiltered. */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Label for a stored value whose display text differs, such as an enum column. */
  labelForValue?: (value: string) => string;
  /** Orders the values listed; the API's order is kept without it. */
  compareValues?: (a: string, b: string) => number;
  /**
   * Extra query params the endpoint scopes its value list by — the active tab, the list's
   * toolbar filters and its keyword (as `listSearch`) — so the list offers only the values
   * of the rows on screen.
   */
  params?: Record<string, string | undefined>;
  /**
   * Every column selection of the table. The endpoint offers the values of the rows the
   * other columns' selections leave, so filtering narrows step by step as in Excel.
   */
  filters?: TableColumnFilterSelections;
}

/**
 * Excel-style value filter for one table column.
 *
 * The values come from the API, so they cover every page rather than the loaded one, and
 * they are those of the rows the table's other filters leave, as in Excel. They arrive page
 * by page with a server-side search. Selecting values narrows the list
 * to them; selecting none leaves the column unfiltered.
 */
export function TableColumnFilter({
  columnLabel,
  column,
  endpoint,
  localValues,
  selected,
  onChange,
  labelForValue,
  compareValues,
  params,
  filters,
}: Readonly<TableColumnFilterProps>) {
  const t = useTranslations("common.tableFilter");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isLocal = localValues !== undefined;

  // A labelled column stores one text and shows another, so only the client can match
  // what the user reads: the server would compare the search against the stored code.
  const searchesLabels = labelForValue !== undefined;

  const [localSearch, setLocalSearch] = useState("");
  const remote = useColumnFilterValues({
    endpoint,
    column,
    enabled: open && !isLocal,
    extraParams: params,
    columnFilters: filters,
    searchOnServer: !searchesLabels,
  });

  // Left to the React Compiler to memoize: `labelForValue` is a caller-owned callback, so a
  // hand-written dependency list could not be preserved.
  const query = (isLocal ? localSearch : remote.search).trim().toLowerCase();
  const matchesSearch = (value: string) =>
    !query ||
    includesFolded(labelForValue?.(value) ?? value, query) ||
    includesFolded(value, query);

  const localValueList = isLocal
    ? [...new Set(localValues)].filter(matchesSearch)
    : [];
  // A date or number typed as the cell reads it is searched on the server in its stored
  // form; only other text is matched here, against the labels.
  const searchesStoredForm =
    searchesLabels && toStoredValueSearch(remote.search) !== null;
  const remoteValueList =
    searchesLabels && !searchesStoredForm
      ? remote.values.filter(matchesSearch)
      : remote.values;

  const listedValues = isLocal ? localValueList : remoteValueList;
  const values = compareValues
    ? [...listedValues].sort(compareValues)
    : listedValues;
  const search = isLocal ? localSearch : remote.search;
  const setSearch = isLocal ? setLocalSearch : remote.setSearch;
  const isLoading = isLocal ? false : remote.isLoading;
  const isLoadingMore = isLocal ? false : remote.isLoadingMore;
  const hasMore = isLocal ? false : remote.hasMore;
  const loadMore = isLocal ? NO_OP : remote.loadMore;
  const isError = isLocal ? false : remote.isError;

  const isSearchingLabels =
    searchesLabels &&
    !isLocal &&
    !searchesStoredForm &&
    remote.search.trim() !== "";

  // A label search can only see the pages already fetched, so it pulls the rest in — up to a
  // bound, past which the next page waits for the reader to scroll to the end rather than flooding the API.
  const canAutoLoad = remote.values.length < LABEL_SEARCH_MAX_VALUES;
  useEffect(() => {
    if (isSearchingLabels && canAutoLoad && hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [isSearchingLabels, canAutoLoad, hasMore, isLoadingMore, loadMore]);

  const isFiltered = selected.length > 0;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const label = (value: string) =>
    (labelForValue?.(value) ?? value) || t("blank");

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const openPopover = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - POPOVER_WIDTH_PX - 8),
      );
      const fitsBelow =
        rect.bottom + POPOVER_GAP_PX + POPOVER_MAX_HEIGHT_PX <=
        window.innerHeight;
      const top = fitsBelow
        ? rect.bottom + POPOVER_GAP_PX
        : Math.max(8, rect.top - POPOVER_GAP_PX - POPOVER_MAX_HEIGHT_PX);
      setPosition({ top, left });
    }
    setSearch("");
    setOpen(true);
  };

  /**
   * The next page is fetched when the user actually reaches the end of the list, so opening
   * a filter costs one short request rather than a burst of them.
   */
  const handleListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoadingMore) return;
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - LOAD_MORE_THRESHOLD_PX) {
      loadMore();
    }
  };

  const toggleValue = (value: string, checked: boolean) => {
    onChange(
      checked
        ? [...selected, value]
        : selected.filter((entry) => entry !== value),
    );
  };

  const areAllLoadedSelected =
    values.length > 0 && values.every((value) => selectedSet.has(value));

  const toggleLoaded = (checked: boolean) => {
    if (!checked) {
      onChange(selected.filter((value) => !values.includes(value)));
      return;
    }
    const merged = new Set(selected);
    values.forEach((value) => merged.add(value));
    onChange([...merged]);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("filterColumn", { column: columnLabel })}
        aria-expanded={open}
        title={
          isFiltered
            ? t("filteredColumn", {
                column: columnLabel,
                count: selected.length,
              })
            : t("filterColumn", { column: columnLabel })
        }
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded align-middle transition-colors",
          isFiltered
            ? "bg-brand px-1 py-[1px] text-white"
            : "p-0.5 text-text-tertiary hover:bg-black/5 hover:text-text-primary",
          open && !isFiltered && "bg-black/5 text-text-primary",
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          openPopover();
        }}
      >
        <Icon name="filter" size={12} />
        {isFiltered ? (
          <span className="text-[10px] font-bold leading-none">
            {selected.length}
          </span>
        ) : null}
      </button>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={t("filterColumn", { column: columnLabel })}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: POPOVER_WIDTH_PX,
                zIndex: POPOVER_Z_INDEX,
              }}
              className="flex flex-col overflow-hidden rounded-[9px] border border-border-secondary bg-surface-primary text-xs shadow-[0_10px_34px_rgba(15,23,42,0.18)]"
            >
              <div className="border-b border-border-tertiary p-2">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchValue")}
                  className="w-full rounded-md border border-border-secondary bg-surface-primary px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 border-b border-border-tertiary px-3 py-1.5 font-semibold text-text-primary hover:bg-surface-secondary">
                <input
                  type="checkbox"
                  className="h-[13px] w-[13px] cursor-pointer accent-brand"
                  checked={areAllLoadedSelected}
                  onChange={(event) => toggleLoaded(event.target.checked)}
                />
                <span>{t("selectAll")}</span>
              </label>

              <div
                ref={listRef}
                onScroll={handleListScroll}
                className="scrollbar-thin max-h-[220px] overflow-y-auto py-1"
              >
                {isLoading ? (
                  <p className="px-3 py-2.5 text-text-tertiary">
                    {t("loading")}
                  </p>
                ) : null}

                {!isLoading && isError ? (
                  <p className="px-3 py-2.5 text-danger-text">
                    {t("loadError")}
                  </p>
                ) : null}

                {!isLoading &&
                !isError &&
                values.length === 0 &&
                !(isSearchingLabels && canAutoLoad && hasMore) ? (
                  <p className="px-3 py-2.5 text-text-tertiary">
                    {t("noValues")}
                  </p>
                ) : null}

                {values.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1 text-text-primary hover:bg-surface-secondary"
                  >
                    <input
                      type="checkbox"
                      className="h-[13px] w-[13px] cursor-pointer accent-brand"
                      checked={selectedSet.has(value)}
                      onChange={(event) =>
                        toggleValue(value, event.target.checked)
                      }
                    />
                    <span className="truncate" title={label(value)}>
                      {label(value)}
                    </span>
                  </label>
                ))}

                {isLoadingMore ? (
                  <p className="px-3 py-1.5 text-center text-text-tertiary">
                    {t("loading")}
                  </p>
                ) : null}
              </div>

              <div className="flex gap-1.5 border-t border-border-tertiary p-2">
                <button
                  type="button"
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border-secondary bg-surface-primary px-2 py-1 text-text-secondary transition-colors hover:bg-surface-secondary"
                  onClick={() => onChange([])}
                >
                  <Icon name="filter-off" size={13} />
                  {t("clearColumn")}
                </button>
                <button
                  type="button"
                  className="flex-1 cursor-pointer rounded-md bg-brand px-2 py-1 font-semibold text-white transition-opacity hover:opacity-90"
                  onClick={() => setOpen(false)}
                >
                  {t("close")}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export interface TableColumnFilterSummaryProps {
  filters: ActiveColumnFilter[];
  onClearColumn: (key: string) => void;
  onClearAll: () => void;
}

/**
 * The filters a table currently applies, one chip per column.
 *
 * It appears only while something is filtered, so an unfiltered table carries no extra
 * chrome, and it names every filtered column — a closed filter popover would otherwise
 * leave the reason a list looks short somewhere off screen.
 */
export function TableColumnFilterSummary({
  filters,
  onClearColumn,
  onClearAll,
}: Readonly<TableColumnFilterSummaryProps>) {
  const t = useTranslations("common.tableFilter");

  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border-secondary bg-brand-50/60 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {t("activeLabel")}
      </span>

      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-surface-primary py-0.5 pl-2 pr-1 text-xs text-text-primary"
        >
          <span className="font-semibold">{filter.label}</span>
          <span className="text-text-secondary">{filter.count}</span>
          <button
            type="button"
            aria-label={t("removeColumnFilter", { column: filter.label })}
            title={t("removeColumnFilter", { column: filter.label })}
            className="cursor-pointer rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-black/5 hover:text-text-primary"
            onClick={() => onClearColumn(filter.key)}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-danger-text/30 bg-danger-bg px-2.5 py-1 text-xs text-danger-text transition-colors hover:brightness-95"
      >
        <Icon name="filter-off" size={13} />
        {t("clearAllCount", { count: filters.length })}
      </button>
    </div>
  );
}
