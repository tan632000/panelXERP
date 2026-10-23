"use client";

import { useState } from "react";

import { RecordPickerField } from "@/kernel/core/components/ui/RecordPickerField";
import {
  useRecordPickerQuery,
  type RecordPickerPageParams,
} from "@/kernel/core/hooks/useRecordPickerQuery";

import type { TableColumn } from "@/kernel/core/components/ui/Table";
import type { PaginatedResponse } from "@/kernel/core/types/common";

/**
 * What a form binds to, and what every reference field built on this one re-exports unchanged.
 *
 * `displayLabel` is the `code — name` label of the current selection. The form resolves it,
 * because the popup's records only load once it is opened.
 */
export interface RecordPickerBindingProps<T> {
  value: string;
  displayLabel?: string;
  onChange: (record: T) => void;
  /** Called when the selection is cleared, by the clear button or by emptying a typed field. */
  onClear?: () => void;
  /** Set for a reference that may also be written by hand; see `RecordPickerField`. */
  onFreeText?: (text: string) => void;
  /**
   * Values held by sibling rows of a repeat-free reference list. They stay listed in the popup
   * and are shown disabled.
   */
  takenValues?: readonly string[];
  /**
   * The key this caller's `value` and `takenValues` are written in, when it differs from the
   * field's own `getValue` — a form that holds a material code where the field keys by id.
   */
  matchValue?: (record: T) => string;
  /**
   * The `rowKey` of the held row, for a field whose value is shared by several rows (an MRP
   * line picked by material, a stock lot picked by material) — it marks that one row only.
   */
  selectedKey?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** What a caller supplies to describe the list its popup searches. */
export interface RecordPickerSourceConfig<T> {
  title: string;
  searchPlaceholder: string;
  emptyText: string;
  /** The owning list's columns, so the popup reads as that list's own screen. */
  columns: Array<TableColumn<T>>;
  rowKey: (record: T) => string;
  getValue: (record: T) => string;
  queryKey: (search: string) => readonly unknown[];
  fetchPage: (params: RecordPickerPageParams) => Promise<PaginatedResponse<T>>;
  /**
   * Resolves a typed keyword to classification enum values, so searching the label shown in the
   * classification column finds its rows. Omit it for a list without such a column.
   */
  matchClassifications?: (keyword: string) => string[];
}

export interface RecordPickerSourceFieldProps<T>
  extends RecordPickerBindingProps<T>, RecordPickerSourceConfig<T> {
  /** Optional extra filter row (e.g. date range) rendered under search. */
  filterBar?: React.ReactNode;
  /** Keep the popup at a constant position and height while its list reloads. */
  fixedFrame?: boolean;
  /**
   * Row tint, for a list whose rows carry a per-row state — the XLBM lot picker tints by
   * expiry level. Omitted by every list without such a state.
   */
  rowClassName?: (record: T) => string | undefined;
}

/**
 * A reference field backed by a search popup over a paged list. Clicking it opens that popup,
 * unless `onFreeText` marks it as a field that may also be typed into.
 *
 * Holds the popup's open and keyword state and connects it to the caller's paged query, so a
 * concrete reference field is nothing but the configuration of its own list. Add a reference
 * field by writing that configuration; do not re-implement this wiring.
 */
export function RecordPickerSourceField<T>({
  value,
  displayLabel,
  onChange,
  onClear,
  onFreeText,
  takenValues,
  matchValue,
  selectedKey,
  placeholder,
  disabled,
  className,
  title,
  searchPlaceholder,
  emptyText,
  columns,
  rowKey,
  getValue,
  queryKey,
  fetchPage,
  matchClassifications,
  filterBar,
  fixedFrame,
  rowClassName,
}: RecordPickerSourceFieldProps<T>) {
  const [search, setSearch] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const { records, isLoading, isLoadingMore, hasMore, loadMore } =
    useRecordPickerQuery<T>({
      search,
      enabled: isPickerOpen,
      queryKey,
      fetchPage,
      matchClassifications,
    });

  return (
    <RecordPickerField<T>
      displayValue={displayLabel || ""}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      title={title}
      columns={columns}
      records={records}
      rowKey={rowKey}
      value={value}
      getValue={matchValue ?? getValue}
      selectedKey={selectedKey}
      takenValues={takenValues}
      onSelect={onChange}
      onClear={onClear}
      onFreeText={onFreeText}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      isLoading={isLoading}
      isLoadingMore={isLoadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
      onOpenChange={setIsPickerOpen}
      filterBar={filterBar}
      fixedFrame={fixedFrame}
      rowClassName={rowClassName}
    />
  );
}
