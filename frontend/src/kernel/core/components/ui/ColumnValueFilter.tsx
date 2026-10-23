"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { DropdownSelect } from "@/kernel/core/components/ui/DropdownSelect";
import { useColumnFilterValues } from "@/kernel/core/hooks/api/useColumnFilterValues";
import { withColumnSelection } from "@/kernel/core/lib/table-column-filter";

import type { DropdownOption } from "@/kernel/core/components/ui/DropdownSelect";
import type { TableColumnFilterSelections } from "@/kernel/core/types/column-filter";

const ALL = "all";
/** Held while the column header picked several values: the field names them, it cannot pick it. */
const SEVERAL = "__several__";

interface ColumnValueFilterProps {
  /** Caption in the toolbar's filter panel — the column header, e.g. the classification header. */
  label: string;
  /** The column's filter key, as its table resolves it (`filterKey ?? key`). */
  column: string;
  /** The table's column selections; this field reads and writes only `column`. */
  selections: TableColumnFilterSelections;
  onSelectionsChange: (next: TableColumnFilterSelections) => void;
  /** The table's column-values endpoint, for a server-paged list. */
  endpoint?: string;
  /** The table's toolbar scope, as it hands its own column filters. */
  params?: Record<string, string | undefined>;
  /** Every value of the column, for a list whose rows all live in the browser. */
  localValues?: string[];
  /** The label the cell shows for a stored value — the column's `filterLabel`. */
  labelForValue?: (value: string) => string;
  /** The column's `filterValueOrder`. */
  compareValues?: (a: string, b: string) => number;
}

/**
 * A toolbar filter over one table column: it offers the values the column's header filter
 * offers and holds the same selection, so the two never disagree and the list needs no
 * query parameter of its own.
 */
export function ColumnValueFilter({
  label,
  column,
  selections,
  onSelectionsChange,
  endpoint,
  params,
  localValues,
  labelForValue,
  compareValues,
}: Readonly<ColumnValueFilterProps>) {
  const tCommon = useTranslations("common");
  // Values load once the list is first opened, so no list pays for a filter nobody opened.
  const [opened, setOpened] = useState(false);
  const remote = useColumnFilterValues({
    endpoint,
    column,
    enabled: opened && localValues === undefined,
    extraParams: params,
    columnFilters: selections,
    searchOnServer: false,
  });

  const selected = selections[column] ?? [];
  const toLabel = (value: string) =>
    (labelForValue?.(value) ?? value) || tCommon("tableFilter.blank");

  const values = [...new Set(localValues ?? remote.values)];
  for (const value of selected) {
    if (!values.includes(value)) values.push(value);
  }
  if (compareValues) values.sort(compareValues);

  const options: DropdownOption[] = [
    { value: ALL, label: tCommon("allOption") },
    ...values.map((value) => ({ value, label: toLabel(value) })),
  ];
  if (selected.length > 1) {
    options.push({ value: SEVERAL, label: selected.map(toLabel).join(", ") });
  }

  let value = ALL;
  if (selected.length === 1) value = selected[0];
  else if (selected.length > 1) value = SEVERAL;

  return (
    <DropdownSelect
      showFilterIcon
      allowClear
      clearValue={ALL}
      filterLabel={label}
      allowCustomInput={false}
      onOpen={() => setOpened(true)}
      asyncLoad={
        localValues === undefined
          ? {
              isLoading: remote.isLoading,
              hasMore: remote.hasMore,
              isLoadingMore: remote.isLoadingMore,
              onLoadMore: remote.loadMore,
            }
          : undefined
      }
      value={value}
      onChange={(next) => {
        if (next === SEVERAL) return;
        onSelectionsChange(
          withColumnSelection(
            selections,
            column,
            next === ALL ? undefined : [next],
          ),
        );
      }}
      options={options}
    />
  );
}
