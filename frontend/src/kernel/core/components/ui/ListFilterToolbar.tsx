"use client";

import React from "react";

import { DateRangeFilter } from "@/kernel/core/components/ui/DateRangeFilter";
import { DropdownSelect } from "@/kernel/core/components/ui/DropdownSelect";
import { ListToolbar } from "@/kernel/core/components/ui/ListPageLayout";
import { PageToolbarActions } from "@/kernel/core/components/ui/PageToolbarActions";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import { PermissionGate } from "@/kernel/core/permissions/PermissionGate";

/** The keyword box of a list, with the commit-on-Enter handler its hook provides. */
export interface ListFilterSearch {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  className?: string;
}

/**
 * One filter dropdown of a list.
 *
 * `options` are the real values only: the clearable "all" entry is prepended here, because
 * every list on the screen spells that entry the same way and a list that forgot it would be
 * the only one a reader cannot clear.
 */
export interface ListFilterSelect {
  key: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Text of the prepended clear entry, e.g. "Status". Omit for a dropdown without one. */
  allLabel?: string;
  /** Value the clear entry carries; the list reads it as "no filter". */
  allValue?: string;
  /** Marks this dropdown in tests, the way a screen's own filters are addressed. */
  testId?: string;
}

/** The document-date range every dated list filters on. */
export interface ListFilterDateRange {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

/** The add button of a list, with the permission that may hide it. */
export interface ListFilterAddAction {
  label: string;
  onClick: () => void;
  /** Hides the button for an account without it. Omit for a list everyone may add to. */
  permission?: string;
  showExport?: boolean;
}

export interface ListFilterToolbarProps {
  search?: ListFilterSearch;
  selects?: ListFilterSelect[];
  dateRange?: ListFilterDateRange;
  /**
   * Controls this screen has beyond the standard ones — an urgent-only switch, a second date
   * axis, a segmented control. They render after the dropdowns and before the actions.
   */
  children?: React.ReactNode;
  add?: ListFilterAddAction;
  /**
   * Replaces the right-hand action area outright, for a list whose actions are not "add a
   * record" — an export-only report, a bulk importer. Takes precedence over `add`.
   */
  actions?: React.ReactNode;
}

/**
 * The filter row of a list screen: keyword search, the screen's filter dropdowns, a date
 * range and the add button, in the order every list draws them.
 *
 * Lives in the kernel because that row is the same on every list; a screen states only which
 * axes it has. Anything a screen does differently is expressed rather than forked: extra
 * controls go in `children`, and a screen whose actions are not an add button passes
 * `actions` to replace that area entirely.
 */
export function ListFilterToolbar({
  search,
  selects,
  dateRange,
  children,
  add,
  actions,
}: Readonly<ListFilterToolbarProps>) {
  const addButton = add ? (
    <PageToolbarActions
      addButtonLabel={add.label}
      onAddClick={add.onClick}
      showExport={add.showExport ?? false}
    />
  ) : null;

  return (
    <ListToolbar>
      {search ? (
        <SearchInput
          placeholder={search.placeholder}
          value={search.value}
          onChangeValue={search.onChange}
          onKeyDown={search.onKeyDown}
          className={search.className}
        />
      ) : null}

      {(selects ?? []).map((select) => {
        const allValue = select.allValue ?? "all";
        const dropdown = (
          <DropdownSelect
            showFilterIcon
            allowClear
            clearValue={allValue}
            value={select.value}
            onChange={select.onChange}
            options={
              select.allLabel
                ? [
                    { value: allValue, label: select.allLabel },
                    ...select.options,
                  ]
                : select.options
            }
          />
        );
        return select.testId ? (
          <span key={select.key} data-testid={select.testId}>
            {dropdown}
          </span>
        ) : (
          <React.Fragment key={select.key}>{dropdown}</React.Fragment>
        );
      })}

      {dateRange ? (
        <DateRangeFilter
          dateFrom={dateRange.dateFrom}
          dateTo={dateRange.dateTo}
          onDateFromChange={dateRange.onDateFromChange}
          onDateToChange={dateRange.onDateToChange}
        />
      ) : null}

      {children}

      {actions ??
        (add?.permission ? (
          <PermissionGate permission={add.permission}>
            {addButton}
          </PermissionGate>
        ) : (
          addButton
        ))}
    </ListToolbar>
  );
}
