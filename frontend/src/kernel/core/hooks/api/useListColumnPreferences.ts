"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import api from "@/kernel/core/api/api";
import { queryKeys } from "@/kernel/core/constants/queryKeys";

interface ListPreference {
  moduleKey: string;
  visibleColumns: string[];
  frozenColumn: string | null;
  /** Absent on a row stored before widths were kept. */
  columnWidths?: Record<string, number>;
}

/** Everything one write stores: the server row minus its key. */
type PreferenceState = Omit<ListPreference, "moduleKey">;

export interface ListColumnPreferences {
  /** Hideable columns this account left visible, in the order the table declares them. */
  visibleColumns: string[];
  isVisible: (key: string) => boolean;
  /** Shows a hidden column or hides a shown one; the last visible column cannot be hidden. */
  toggle: (key: string) => void;
  /** Drops the stored choice back to "every column visible". */
  showAll: () => void;
  /** Hides every column but the first: a list with no data column left is unreadable. */
  hideAll: () => void;
  /**
   * Last column pinned while the table scrolls sideways; every column before it is pinned
   * with it, the way Excel freezes panes up to a chosen column. Null freezes nothing.
   */
  frozenColumn: string | null;
  /** Freezes up to this column, or unfreezes when given null. */
  setFrozenColumn: (key: string | null) => void;
  /**
   * Width in pixels of each column the account dragged, keyed by column key. Empty means
   * every column keeps the width it declares.
   */
  columnWidths: Record<string, number>;
  /** Stores the dragged widths; an empty map goes back to the declared widths. */
  setColumnWidths: (widths: Record<string, number>) => void;
}

const NO_COLUMN_WIDTHS: Record<string, number> = {};

/**
 * Which columns of one list screen this account chose to see.
 *
 * The choice lives on the server keyed by `(user_id, module_key)`, so it follows the account
 * rather than the browser and survives signing out. An account that never customised the list
 * sees every column, so an absent record and an empty stored list are two different things:
 * the first means "not chosen yet", the second would mean "chose to hide everything".
 *
 * A change is stored right away — the popup has no apply button — and the local cache is
 * written first so the table reacts on the same tick rather than after the round trip.
 *
 * Passing no `moduleKey` returns an inert controller that keeps every column visible, which
 * is what a table without a preference key needs.
 */
export function useListColumnPreferences(
  moduleKey: string | undefined,
  hideableKeys: string[],
  /** Columns a reader who never customised this list starts without. */
  defaultHiddenKeys: readonly string[] = [],
): ListColumnPreferences {
  const qc = useQueryClient();
  const enabled = Boolean(moduleKey);
  const endpoint = `/list-preferences/${moduleKey ?? ""}`;
  const queryKey = queryKeys.listColumnPreference(moduleKey ?? "");

  const { data } = useQuery({
    queryKey,
    enabled,
    /**
     * Read once per session and never refetched: this row changes only through the popup
     * below, which writes the cache itself. Without it every visit to a list screen would
     * spend a round trip re-reading a value the client already holds.
     */
    staleTime: Infinity,
    queryFn: async () => {
      const { data: stored } = await api.get<ListPreference | null>(endpoint);
      return stored ?? null;
    },
  });

  const store = useMutation({
    mutationFn: async (next: PreferenceState) => {
      const { data: saved } = await api.put<ListPreference>(endpoint, next);
      return saved;
    },
  });

  const visibleColumns = useMemo(() => {
    const stored = data?.visibleColumns;
    if (!stored) {
      const hiddenByDefault = new Set(defaultHiddenKeys);
      return hideableKeys.filter((key) => !hiddenByDefault.has(key));
    }
    const chosen = new Set(stored);
    return hideableKeys.filter((key) => chosen.has(key));
  }, [data, hideableKeys, defaultHiddenKeys]);

  const frozenColumn = data?.frozenColumn ?? null;
  const columnWidths = data?.columnWidths ?? NO_COLUMN_WIDTHS;

  const write = useCallback(
    (next: Partial<PreferenceState>) => {
      if (!moduleKey) return;
      // Every write carries the whole row, so changing one setting never resets another.
      const full: PreferenceState = {
        visibleColumns,
        frozenColumn,
        columnWidths,
        ...next,
      };
      qc.setQueryData<ListPreference>(queryKey, { moduleKey, ...full });
      store.mutate(full);
    },
    [
      columnWidths,
      frozenColumn,
      moduleKey,
      qc,
      queryKey,
      store,
      visibleColumns,
    ],
  );

  const toggle = useCallback(
    (key: string) => {
      const isShown = visibleColumns.includes(key);
      // Hiding the last one would leave a table with no data at all, and no way back to it
      // other than the popup that is already open, so the final column stays.
      if (isShown && visibleColumns.length <= 1) return;

      // Rebuilt from the table's own order, so hiding and re-showing a column puts it back
      // where the table expects it rather than at the end.
      const next = isShown
        ? visibleColumns.filter((column) => column !== key)
        : hideableKeys.filter(
            (column) => column === key || visibleColumns.includes(column),
          );

      // A frozen column that has just been hidden would pin nothing, so the freeze moves
      // off with it rather than silently pinning a different column.
      write({
        visibleColumns: next,
        frozenColumn: next.includes(frozenColumn ?? "") ? frozenColumn : null,
      });
    },
    [frozenColumn, hideableKeys, visibleColumns, write],
  );

  const showAll = useCallback(
    () => write({ visibleColumns: hideableKeys }),
    [hideableKeys, write],
  );

  const hideAll = useCallback(() => {
    const kept = hideableKeys.slice(0, 1);
    if (kept.length === 0) return;
    // The freeze cannot outlive the columns it pinned, so it survives only on the one kept.
    write({
      visibleColumns: kept,
      frozenColumn: kept[0] === frozenColumn ? frozenColumn : null,
    });
  }, [frozenColumn, hideableKeys, write]);

  const setFrozenColumn = useCallback(
    (key: string | null) => write({ frozenColumn: key }),
    [write],
  );

  const setColumnWidths = useCallback(
    (widths: Record<string, number>) => write({ columnWidths: widths }),
    [write],
  );

  const isVisible = useCallback(
    (key: string) => visibleColumns.includes(key),
    [visibleColumns],
  );

  return useMemo(
    () =>
      enabled
        ? {
            visibleColumns,
            isVisible,
            toggle,
            showAll,
            hideAll,
            frozenColumn,
            setFrozenColumn,
            columnWidths,
            setColumnWidths,
          }
        : {
            visibleColumns: hideableKeys,
            isVisible: () => true,
            toggle: () => {},
            showAll: () => {},
            hideAll: () => {},
            frozenColumn: null,
            setFrozenColumn: () => {},
            columnWidths: NO_COLUMN_WIDTHS,
            setColumnWidths: () => {},
          },
    [
      columnWidths,
      enabled,
      frozenColumn,
      hideAll,
      hideableKeys,
      isVisible,
      setColumnWidths,
      setFrozenColumn,
      showAll,
      toggle,
      visibleColumns,
    ],
  );
}
