"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useMemo } from "react";

import { ListTableFrame } from "@/kernel/core/components/ui/ListTableFrame";
import { LoadMoreSentinel } from "@/kernel/core/components/ui/LoadMoreSentinel";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { pickerColumnWidthKey } from "@/kernel/core/lib/picker-column-width-key";

export interface MultiPickerModalProps<T extends { id: number }> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  submitLabel?: string;
  /** Narrower frame for a short column set. */
  wide?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** The record's own columns; the tick column is added here. */
  columns: Array<TableColumn<T>>;
  records: T[];
  /** Names a row's tick for assistive technology. */
  rowLabel: (record: T) => string;
  picked: number[];
  onPickedChange: (ids: number[]) => void;
  selectedCountText: string;
  emptyText?: string;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Commits `picked`; the modal closes itself afterwards. */
  onConfirm: () => void;
  tableClassName?: string;
}

/**
 * Multi-select record picker: search, a paged table that loads on scroll, and a tick per row.
 *
 * Confirmed rather than applied per click — a row toggles, and only Save commits the set, so
 * the field behind never flickers while the reader is still browsing. The whole row toggles:
 * a tick target the width of a checkbox is the hardest thing on the table to hit.
 */
export function MultiPickerModal<T extends { id: number }>({
  isOpen,
  onClose,
  title,
  submitLabel,
  wide = false,
  search,
  onSearchChange,
  searchPlaceholder,
  columns,
  records,
  rowLabel,
  picked,
  onPickedChange,
  selectedCountText,
  emptyText,
  isLoading = false,
  isLoadingMore,
  hasMore = false,
  onLoadMore,
  onConfirm,
  tableClassName,
}: Readonly<MultiPickerModalProps<T>>) {
  const tCommon = useTranslations("common");

  const toggle = useCallback(
    (id: number) =>
      onPickedChange(
        picked.includes(id)
          ? picked.filter((item) => item !== id)
          : [...picked, id],
      ),
    [onPickedChange, picked],
  );

  const allColumns = useMemo<Array<TableColumn<T>>>(
    () => [
      {
        key: "select",
        header: "",
        style: { width: 40 },
        render: (_, record) => (
          <input
            type="checkbox"
            aria-label={rowLabel(record)}
            className="h-[13px] w-[13px] cursor-pointer accent-brand"
            checked={picked.includes(record.id)}
            onChange={() => toggle(record.id)}
            // The row already toggles; without this the click would run twice.
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      ...columns,
    ],
    [columns, picked, rowLabel, toggle],
  );

  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      onSubmit={confirm}
      submitLabel={submitLabel ?? tCommon("save")}
      wide={wide}
      extraWide={!wide}
    >
      <div className="flex flex-col gap-3">
        <SearchInput
          fullWidth
          placeholder={searchPlaceholder}
          value={search}
          onChangeValue={onSearchChange}
        />
        <ListTableFrame className="max-h-[360px]">
          <Table<T>
            columns={allColumns}
            columnWidthPreferenceKey={pickerColumnWidthKey(
              allColumns.map((column) => column.key),
            )}
            data={isLoading ? [] : records}
            rowKey={(record) => String(record.id)}
            onRowClick={(record) => toggle(record.id)}
            activateRowOn="single"
            rowClassName={(record) =>
              picked.includes(record.id) ? "bg-brand-50/60" : undefined
            }
            emptyText={
              isLoading
                ? tCommon("loading")
                : (emptyText ?? tCommon("noResults"))
            }
            tableClassName={tableClassName}
            noWrapper
            fitColumnWidths
          />
          <LoadMoreSentinel
            hasMore={hasMore}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
          />
        </ListTableFrame>
        <p className="text-[12px] text-text-secondary">{selectedCountText}</p>
      </div>
    </Modal>
  );
}
