"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { LoadMoreSentinel } from "@/kernel/core/components/ui/LoadMoreSentinel";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCardsContext } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { cn } from "@/kernel/core/lib/cn";
import { pickerColumnWidthKey } from "@/kernel/core/lib/picker-column-width-key";

/**
 * Above `Modal` (z-100) and the `DropdownSelect` menu (z-110): a picker is opened from a
 * field that already sits inside a modal, so it has to cover the form it was opened from.
 */
const RECORD_PICKER_Z_INDEX = 200;

export interface RecordPickerDialogProps<T> {
  isOpen: boolean;
  onClose: () => void;
  /** Dialog heading (localized via i18n, e.g. material search title). */
  title: string;
  /** Same column shape the matching list screen uses, so the popup reads as that list. */
  columns: Array<TableColumn<T>>;
  records: T[];
  rowKey: (item: T) => string;
  onSelect: (item: T) => void;
  /** Records shown but not selectable, e.g. already held by a sibling row. */
  isRecordDisabled?: (item: T) => boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Set by `RecordPickerField` so the field can point `aria-controls` at this dialog. */
  id?: string;
  tableClassName?: string;
  /**
   * Row tint, for a picker whose list carries a per-row state — the XLBM lot picker tints by
   * expiry level. Optional: a list with no such state leaves it unset.
   */
  rowClassName?: (item: T) => string | undefined;
  /** Optional extra filter row (e.g. date range + clear) rendered under search. */
  filterBar?: React.ReactNode;
  /**
   * Pin the dialog to a constant top and height. A search that hides the table
   * otherwise collapses the box and the centered overlay recenters it.
   */
  fixedFrame?: boolean;
  /** Rows of the record the field currently holds, highlighted so the reader sees the pick. */
  selectedKeys?: string[];
}

/**
 * Record search popup for reference fields: search plus the owning module's list, where a
 * row click is the only thing that selects. Paging is replaced by loading the next page when
 * the `LoadMoreSentinel` below the table scrolls into view.
 */
export function RecordPickerDialog<T>({
  isOpen,
  onClose,
  title,
  columns,
  records,
  rowKey,
  onSelect,
  isRecordDisabled,
  search,
  onSearchChange,
  searchPlaceholder,
  emptyText,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  onLoadMore,
  id,
  tableClassName,
  rowClassName,
  filterBar,
  fixedFrame = false,
  selectedKeys,
}: RecordPickerDialogProps<T>) {
  // The widths the reader drags are kept per column set; see `pickerColumnWidthKey`.
  const columnWidthKey = useMemo(
    () => pickerColumnWidthKey(columns.map((column) => column.key)),
    [columns],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      backdropMouseDownRef.current = event.target === event.currentTarget;
    },
    [],
  );

  /** Only a press that both starts and ends on the backdrop closes, so a drag out of the table does not. */
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        event.target === event.currentTarget &&
        backdropMouseDownRef.current
      ) {
        onClose();
      }
      backdropMouseDownRef.current = false;
    },
    [onClose],
  );

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      className={cn(
        "fixed inset-0 flex justify-center bg-black/40",
        fixedFrame ? "items-start pt-[7vh]" : "items-center",
      )}
      style={{ zIndex: RECORD_PICKER_Z_INDEX }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex w-[1280px] max-w-[95vw] flex-col rounded-xl border border-border-secondary bg-surface-primary shadow-[0_20px_60px_rgba(0,0,0,0.3)]",
          fixedFrame ? "h-[78vh]" : "max-h-[85vh]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-secondary px-[18px] pb-[11px] pt-3.5">
          <span className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
            <Icon name="search" size={16} />
            {title}
          </span>
          <button
            type="button"
            className="flex cursor-pointer border-none bg-transparent p-0 text-2xl leading-none text-text-secondary hover:text-text-primary"
            onClick={onClose}
          >
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="shrink-0 px-[18px] pt-3">
          <SearchInput
            className="max-w-none"
            value={search}
            onChangeValue={onSearchChange}
            placeholder={searchPlaceholder}
          />
          {filterBar ? <div className="mt-2">{filterBar}</div> : null}
        </div>

        {isLoading ? (
          <div className="px-[18px] py-3">
            <LoadingState variant="list" />
          </div>
        ) : null}
        {/*
          One scroller for both axes, bounded by the dialog: the `thead` pins to its top and
          the horizontal scrollbar sits at the dialog's bottom edge rather than after the last
          row. The table therefore renders without its own `ListTableFrame` scroller.

          Hidden rather than unmounted while a search loads: the table owns the column widths
          the reader dragged, and remounting it on every keystroke threw them away. The
          `hidden` attribute, not a CSS class, so the stale table also leaves the
          accessibility tree until the fresh rows arrive.
        */}
        <div
          ref={scrollRef}
          hidden={isLoading}
          className="scrollbar-thin mx-[18px] my-3 min-h-0 flex-1 overflow-auto rounded-[9px] border border-border-secondary"
        >
          {isLoading ? <LoadingState variant="list" /> : null}
          {/*
            Hidden rather than unmounted while a search loads: the table owns the column widths
            the reader dragged, and remounting it on every keystroke threw them away. The
            `hidden` attribute, not a CSS class, so the stale table also leaves the
            accessibility tree until the fresh rows arrive.
          */}
          <div hidden={isLoading}>
            {/* A picker stays a table on a phone: its rows are compared, not read one by one. */}
            <TableMobileCardsContext.Provider value={false}>
              <Table
                columns={columns}
                data={records}
                rowKey={rowKey}
                onRowClick={onSelect}
                activateRowOn="single"
                isRowDisabled={isRecordDisabled}
                selectedKeys={selectedKeys}
                emptyText={emptyText}
                tableClassName={tableClassName ?? "w-max min-w-full"}
                rowClassName={rowClassName}
                fitColumnWidths
                noWrapper
                columnWidthPreferenceKey={columnWidthKey}
              />
            </TableMobileCardsContext.Provider>
            {records.length > 0 ? (
              <LoadMoreSentinel
                hasMore={Boolean(hasMore)}
                isLoading={isLoading}
                isLoadingMore={isLoadingMore}
                onLoadMore={onLoadMore}
                rootRef={scrollRef}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
