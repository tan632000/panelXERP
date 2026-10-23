"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ColumnResizeHandle } from "@/kernel/core/components/ui/ColumnResizeHandle";
import { ListTableFrame } from "@/kernel/core/components/ui/ListTableFrame";
import { TableEmptyRowOwnedContext } from "@/kernel/core/components/ui/table-empty-row-context";
import { useShowTableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import {
  TableColumnFilter,
  TableColumnFilterSummary,
} from "@/kernel/core/components/ui/TableColumnFilter";
import { TableColumnSettings } from "@/kernel/core/components/ui/TableColumnSettings";
import { TableMobileCardList } from "@/kernel/core/components/ui/TableMobileCardList";
import { TableSelectionBar } from "@/kernel/core/components/ui/TableSelectionBar";
import { TableSortControl } from "@/kernel/core/components/ui/TableSortControl";
import { useListColumnPreferences } from "@/kernel/core/hooks/api/useListColumnPreferences";
import { useAccessibleColumns } from "@/kernel/core/hooks/useAccessibleColumns";
import {
  resizedColumnStyle,
  tableCellWrapClass,
  tableHeaderWrapClass,
  useColumnResize,
} from "@/kernel/core/hooks/useColumnResize";
import { cn } from "@/kernel/core/lib/cn";
import {
  isColumnFilterable,
  resolveColumnFilterKey,
  resolveColumnFilterLabel,
  withColumnSelection,
} from "@/kernel/core/lib/table-column-filter";
import {
  buildHeaderRows,
  normalizeHeaderGroup,
} from "@/kernel/core/lib/table-header-groups";
import {
  isColumnSortable,
  nextSortState,
  resolveColumnSortKey,
} from "@/kernel/core/lib/table-sort";

import type { ListColumnPreferences } from "@/kernel/core/hooks/api/useListColumnPreferences";
import type {
  ActiveColumnFilter,
  TableColumnFilterSelections,
} from "@/kernel/core/types/column-filter";
import type { ExcelColumnValue } from "@/kernel/core/types/excel";
import type { TableSortState } from "@/kernel/core/types/table-sort";

const SELECTABLE_COLUMN_WIDTH = 52;
/**
 * The selection cell hosting the gear beside its checkbox: 14 + 6 padding, a 13px checkbox,
 * a 6px gap and the trigger itself — 24px as a plain gear, or roughly 44px in the badge
 * state, once it counts two digits of hidden columns. Reserving the badge width while no
 * column is hidden only pushes the first column away from the checkbox.
 */
const SELECTABLE_WITH_SETTINGS_COLUMN_WIDTH = 64;
const SELECTABLE_WITH_SETTINGS_BADGE_COLUMN_WIDTH = 84;
const SETTINGS_COLUMN_WIDTH = 40;
/**
 * Share of the table's visible width the pinned columns may take. Past it — a phone, or an
 * account that froze many columns — nothing is left to scroll into view, so the table drops
 * the pinning until it is wide enough again; the saved choice itself is left alone.
 */
const MAX_PINNED_WIDTH_SHARE = 0.6;

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  // Column values come from dynamic keys; callers narrow in render when needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (value: any, item: T, index: number) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Overrides the default rule: a column is filterable when its header carries text.
   * Set false for a column the API cannot filter, such as a computed or formatted cell.
   */
  filterable?: boolean;
  /** Column key the API filters by, when it differs from the table column key. */
  filterKey?: string;
  /** Display text of a stored value, for a column holding an enum rather than its label. */
  filterLabel?: (value: string) => string;
  /** Orders the filter's values when their natural order is not the reading order. */
  filterValueOrder?: (a: string, b: string) => number;
  /**
   * Overrides the default rule: a column is sortable when its header carries text.
   * Set false for a column the API cannot order by.
   */
  sortable?: boolean;
  /** Column key the API sorts by, when it differs from the filter key. */
  sortKey?: string;
  /**
   * Overrides the default rule: a column may be hidden when its header carries text.
   * Set false for a column the list cannot do without, such as its record code.
   */
  hideable?: boolean;
  /**
   * Starts hidden for a reader who never customised the list — a detail column most readers do
   * not need, still one click away in the column settings.
   */
  defaultHidden?: boolean;
  /**
   * Scope required to see this column at all. Absent means the list's read scope is enough,
   * which is every column today. See `column-access` for how this differs from hiding.
   */
  permission?: string;
  /**
   * Draws this cell once per row group instead of once per row, spanning the rows below it.
   * Only meaningful with `rowGroupKey`; use it for a value that belongs to the whole record
   * rather than to the line a row stands for.
   */
  groupSpan?: boolean;
  /** Where the column sits on a phone card; see {@link TableColumnMobile}. */
  mobile?: TableColumnMobile;
  /**
   * Header group labels above this column, outermost first (at most 3 levels). Adjacent
   * visible columns sharing a prefix draw that group once, spanning them; the Excel export
   * merges the same cells.
   */
  headerGroup?: string | string[];
  /**
   * How this column is written to an Excel export, since `render` returns a React node that
   * cannot be serialized. Omitted means the raw value of `key` as text; `false` leaves the
   * column out of the file.
   */
  export?: ExcelColumnValue | false;
  /**
   * Whether this column must hold a value on every import row (mirrors ExcelSpecColumn.required).
   */
  required?: boolean;
}

/**
 * How a column reads on a phone card (`TableMobileCardList`). A column without it keeps the
 * default reading: the first captioned column is the title, a status column the badge, a
 * header-less column the row actions, and every other column a captioned field.
 */
export interface TableColumnMobile {
  /**
   * `title` heads the card (or the line, for a line column), `date` sits top right, `badge`
   * joins the chips under the title, `tag` a captioned pill beside the line title, `metric`
   * a figure tile, `note` a text tile beside the figures, `unit` the unit printed after each
   * figure, `field` a captioned value, `block` a full-width section the column draws itself
   * (a quotation's versions and products, say), `hidden` stays off the card.
   */
  role?:
    | "title"
    | "date"
    | "badge"
    | "tag"
    | "field"
    | "metric"
    | "note"
    | "unit"
    | "block"
    | "hidden";
  /**
   * In a table grouped by `rowGroupKey`, draws the value once in the card's header instead of
   * once per line. Defaults to `groupSpan`.
   */
  record?: boolean;
  /** A shorter caption than the column header, for a card's narrow cell. */
  label?: string;
  /**
   * Tints a metric tile as the figure the reader came for: green (`true`) for what is in
   * stock, violet for what leaves it.
   */
  emphasis?: boolean | "violet";
}

/**
 * Props a table component forwards so a list can own its column filters. A plugin's table
 * extends this instead of restating them, and passes them straight to `Table`.
 */
export interface TableColumnFilterHostProps {
  /** Selected values per column key; the list owns them so its query can send them. */
  columnFilters?: TableColumnFilterSelections;
  onColumnFiltersChange?: (selections: TableColumnFilterSelections) => void;
  /**
   * The list's toolbar scope for its column filters — `columnFilterScope(listParams)` — so
   * each filter offers only the values of the rows on screen.
   */
  columnFilterParams?: Record<string, string | undefined>;
}

/**
 * Props a table component forwards so a list can own its sort. A plugin's table extends this
 * alongside {@link TableColumnFilterHostProps} and passes both straight to `Table`.
 */
export interface TableSortHostProps {
  /** The sorted column; the list owns it so its query can send it. */
  sort?: TableSortState;
  onSortChange?: (next: TableSortState | undefined) => void;
}

export interface TableProps<T>
  extends TableColumnFilterHostProps, TableSortHostProps {
  columns: Array<TableColumn<T>>;
  data: T[];
  emptyText?: string;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /**
   * What can be done to the ticked rows, shown in the selection bar above them. The bar
   * itself, with the count and the clear control, belongs to the table.
   */
  selectionActions?: React.ReactNode;
  rowKey?: (item: T) => string;
  noWrapper?: boolean;
  onRowClick?: (item: T, index: number) => void;
  /** How many clicks fire `onRowClick`. Detail navigation uses `"double"` (default). */
  activateRowOn?: "single" | "double";
  /** Rows that cannot be picked: dimmed, and `onRowClick` does not fire for them. */
  isRowDisabled?: (item: T) => boolean;
  /**
   * Rows a bulk action may not touch — a system-owned record, say. Their checkbox is not
   * rendered at all rather than disabled, so a read-only row shows no dead control, and
   * "select all" passes over them. Default: every row is selectable.
   *
   * Distinct from `isRowDisabled`, which is about picking a row to open; a row can be perfectly
   * openable and still be nobody's to delete.
   */
  isRowSelectable?: (item: T) => boolean;
  /** Extra class names for one row, e.g. a tinted background for a flagged record. */
  rowClassName?: (item: T) => string | undefined;
  tableClassName?: string;
  /**
   * Once a column has been dragged, sizes the table to exactly the sum of its columns instead
   * of keeping it at least as wide as its container, so a column can also be dragged narrower
   * than the share of the container it started with. For a popup whose few columns fill the
   * dialog; a full-width list leaves it off and keeps filling the screen.
   */
  fitColumnWidths?: boolean;
  wrapperClassName?: string;
  /** Number of leading data columns to pin while horizontally scrolling. */
  fixedLeadingColumns?: number;
  /**
   * Column-values endpoint of this list, e.g. `/other-materials/column-values`. Setting it
   * adds a value filter to every filterable column; values and filtering both come from
   * the API, so a filter covers every page rather than the loaded one.
   */
  columnFilterEndpoint?: string;
  /**
   * Endpoint-free column-value source for a table whose full dataset already lives in the
   * browser (no server pagination) — returns every distinct value for one column, keyed by
   * its resolved filter key. Adds the same per-column value filter as `columnFilterEndpoint`,
   * without a round trip; ignored once `columnFilterEndpoint` is set.
   */
  localColumnValues?: (columnKey: string) => string[];
  /**
   * Key this list stores its per-account column choice under, e.g. `product_list_v2`. Setting it
   * adds a settings column whose popup shows and hides the hideable columns, and keeps that
   * choice on the account rather than the browser. The key must be registered on the backend.
   */
  columnPreferenceKey?: string;
  /**
   * Key to store only the dragged column widths under, for a table that offers no column
   * settings — a picker dialog. See `pickerColumnWidthKey`. Ignored when
   * `columnPreferenceKey` is set, which stores the widths itself.
   */
  columnWidthPreferenceKey?: string;
  /**
   * Where the settings gear sits when it has no selection cell or actions column to share
   * (`settingsInOwnColumn`). `"leading"` (default) keeps it at the very start of the header,
   * in reach without scrolling — the right spot for most read-only reports. `"afterFirstColumn"`
   * places it right after the first data column instead, for a report whose first column is
   * the row's own identity and reads better leading the table on its own.
   */
  settingsColumnAnchor?: "leading" | "afterFirstColumn";
  /**
   * Keeps the settings gear in its own leading column even when a trailing actions column could
   * host it, so a wide list shows the gear without scrolling to its far end.
   */
  settingsLeading?: boolean;
  /**
   * Groups consecutive rows that belong to one record, so a list can render a record's lines
   * as one row each while the record's own cells (`groupSpan`) stay a single spanning cell.
   * Rows are grouped only while the key repeats back to back, matching the order the API sent.
   */
  rowGroupKey?: (item: T) => string;
  /**
   * Draws the selection checkbox on every grouped row instead of one spanning cell. What a tick
   * selects follows `rowKey`: a distinct key per row ticks that row alone.
   */
  selectionPerRow?: boolean;
  /**
   * Content for a `<tfoot>` row under the body. A list whose rows carry quantities needs a total
   * the reader can see without exporting. Receives the number of columns the table is currently
   * rendering, which the caller cannot know because column visibility is per account, and the
   * key of each rendered column in header order — `null` for a slot that holds no data column
   * (the selection checkbox, the settings gear) — so a footer can sit a total under its column.
   */
  footer?: (
    columnCount: number,
    columnKeys: ReadonlyArray<string | null>,
  ) => React.ReactNode;
}

function resolveColumnWidth(
  style?: React.CSSProperties,
  fallback = 120,
): number {
  const raw = style?.width ?? style?.minWidth;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Pinned offsets for the leading data columns, plus where the `afterFirstColumn` gear sits
 * once it is itself pinned.
 *
 * The gear only joins the pinned chain when a second column is also frozen — with a single
 * frozen column there is nothing pinned past the gear, so it can keep scrolling under it as
 * before. With two or more, leaving it unpinned would open a gear-wide gap between the two
 * pinned data columns, so its width is folded into the chain right after the first column.
 */
function buildStickyMeta<T>(
  columns: Array<TableColumn<T>>,
  fixedLeadingColumns: number | undefined,
  selectionColumnWidth: number,
  resolveWidth: (column: TableColumn<T>) => number,
  gearAfterFirstWidth: number | undefined,
) {
  if (!fixedLeadingColumns || fixedLeadingColumns <= 0) {
    return null;
  }

  const count = Math.min(fixedLeadingColumns, columns.length);
  const offsets: number[] = [];
  let left = selectionColumnWidth;
  let gearOffset: number | undefined;

  for (let index = 0; index < count; index += 1) {
    offsets[index] = left;
    left += resolveWidth(columns[index]);
    if (index === 0 && gearAfterFirstWidth !== undefined && count >= 2) {
      gearOffset = left;
      left += gearAfterFirstWidth;
    }
  }

  return { count, offsets, gearOffset };
}

/**
 * A title stays on one line while the columns keep their natural widths, and breaks across
 * lines only once the reader has sized the columns (`wrap`), so a column dragged narrower
 * than its title still shows the whole title.
 */
function renderHeaderContent(header: React.ReactNode, wrap: boolean) {
  if (typeof header === "string" || typeof header === "number") {
    return (
      <span
        className={cn("block min-w-0 leading-snug", tableHeaderWrapClass(wrap))}
      >
        {String(header)}
      </span>
    );
  }

  // A custom header has no title span of its own, and a column `className` such as
  // `whitespace-nowrap` lands on the `<th>` it inherits from, so it gets the same rule here.
  return (
    <span className={cn("min-w-0", tableHeaderWrapClass(wrap))}>{header}</span>
  );
}

/**
 * Every column the popup offers: all of them, the actions column included, bar the ones a
 * caller marked `hideable: false`. A list shows what it shows, so the popup names all of it.
 */
function resolveHideableColumns<T>(
  columns: Array<TableColumn<T>>,
): Array<TableColumn<T>> {
  return columns.filter((column) => column.hideable ?? true);
}

/** What the popup calls a column that carries no header text of its own. */
const META_COLUMN_LABEL_KEYS: Record<string, string> = {
  actions: "tableColumns.actionsColumn",
  canGap: "tableColumns.urgentColumn",
};

/** A column drawn without header text: the actions column, the urgency flag. */
function isMetaColumn<T>(column: TableColumn<T>): boolean {
  return resolveColumnFilterLabel(column) === "";
}

/** Keeps every column, for a table that stores no per-account choice. */
const NO_COLUMN_PREFERENCES: ListColumnPreferences = {
  visibleColumns: [],
  isVisible: () => true,
  toggle: () => {},
  showAll: () => {},
  hideAll: () => {},
  frozenColumn: null,
  setFrozenColumn: () => {},
  columnWidths: {},
  setColumnWidths: () => {},
};

/** Controls that act on their own and must never also activate the row they sit in. */
const ROW_CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, label, [role="button"], [role="checkbox"], [role="menuitem"]';

/**
 * Whether a row click/double-click started on a control inside the row — an action button, a
 * checkbox, a link. Those handle the event themselves; letting it also open the row navigated
 * away and unmounted the modal the button had just opened. Stopping `click` in each cell was not
 * enough, because a double-click is a separate event that still bubbled to the row.
 */
function isFromRowControl(event: React.MouseEvent<HTMLElement>): boolean {
  const control = (event.target as HTMLElement | null)?.closest?.(
    ROW_CONTROL_SELECTOR,
  );
  return Boolean(control && event.currentTarget.contains(control));
}

/**
 * A table with no preference key never touches the query client, so a detail sub-table can
 * render outside a `QueryClientProvider` exactly as before; a width-only key outside one (a
 * picker in an isolated test) falls back to session-only widths. The key is fixed per call
 * site, so this branch never flips under an already mounted table.
 */
export function Table<T>(props: TableProps<T>) {
  // Applied before anything else reads the columns, so the header, the body, the settings
  // popup and the stored choice all work from the same list.
  const columns = useAccessibleColumns(props.columns);
  const scoped = { ...props, columns };
  const queryClient = useContext(QueryClientContext);
  const preferenceKey =
    scoped.columnPreferenceKey ??
    (queryClient ? scoped.columnWidthPreferenceKey : undefined);

  return preferenceKey ? (
    <PreferenceAwareTable {...scoped} preferenceKey={preferenceKey} />
  ) : (
    <TableView {...scoped} preferences={NO_COLUMN_PREFERENCES} />
  );
}

function PreferenceAwareTable<T>({
  preferenceKey,
  ...props
}: TableProps<T> & { preferenceKey: string }) {
  const hideableKeys = useMemo(
    () => resolveHideableColumns(props.columns).map((column) => column.key),
    [props.columns],
  );
  const defaultHiddenKeys = useMemo(
    () =>
      resolveHideableColumns(props.columns)
        .filter((column) => column.defaultHidden)
        .map((column) => column.key),
    [props.columns],
  );
  const preferences = useListColumnPreferences(
    preferenceKey,
    hideableKeys,
    defaultHiddenKeys,
  );

  return <TableView {...props} preferences={preferences} />;
}

function TableView<T>({
  columns,
  data,
  emptyText,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  isRowSelectable,
  selectionActions,
  rowKey = (item: T) => {
    const record = item as Record<string, unknown>;
    return String(record.id ?? "");
  },
  noWrapper = false,
  onRowClick,
  activateRowOn = "double",
  isRowDisabled,
  rowClassName,
  tableClassName,
  fitColumnWidths = false,
  wrapperClassName,
  fixedLeadingColumns,
  columnFilterEndpoint,
  columnFilterParams,
  localColumnValues,
  columnPreferenceKey,
  settingsColumnAnchor = "leading",
  settingsLeading = false,
  columnFilters = {},
  onColumnFiltersChange,
  sort,
  onSortChange,
  rowGroupKey,
  selectionPerRow = false,
  footer,
  preferences,
}: TableProps<T> & { preferences: ListColumnPreferences }) {
  const t = useTranslations("common");
  const resolvedEmptyText = emptyText ?? t("noResults");
  const isEmptyRowOwnedOutside = useContext(TableEmptyRowOwnedContext);
  // A phone reads a module's lists as cards once that module turns them on. A table inside a
  // modal stays a table: it is a line editor or a picker, not a list of records.
  const showCards = useShowTableMobileCards();
  const showColumnFilters = Boolean(
    (columnFilterEndpoint || localColumnValues) && onColumnFiltersChange,
  );
  // Sorting is the list's to opt into: it needs no endpoint of its own, only a query that
  // forwards the parameters.
  const showSort = Boolean(onSortChange);

  const hideableColumns = useMemo(
    () => resolveHideableColumns(columns),
    [columns],
  );
  const hideableKeys = useMemo(
    () => hideableColumns.map((column) => column.key),
    [hideableColumns],
  );
  const showColumnSettings = Boolean(columnPreferenceKey);

  /** What the table actually renders: the fixed columns plus the chosen hideable ones. */
  const visibleColumns = useMemo(() => {
    if (!showColumnSettings) return columns;
    const hideable = new Set(hideableKeys);
    return columns.filter(
      (column) =>
        !hideable.has(column.key) || preferences.isVisible(column.key),
    );
  }, [columns, hideableKeys, preferences, showColumnSettings]);

  /** Header rows: one per group level plus the leaf row; a single row with no groups. */
  const headerLayout = useMemo(
    () => buildHeaderRows(visibleColumns),
    [visibleColumns],
  );
  const headerRowSpan =
    headerLayout.depth > 0 ? headerLayout.depth + 1 : undefined;

  /**
   * Where the settings control sits.
   *
   * Beside the select-all checkbox, in the leading selection cell: the gear then sits at a
   * fixed spot at the start of the header, in reach without scrolling a wide table sideways
   * and in the same place on every list.
   *
   * A list without a selection column has no such cell, so it falls back to its trailing
   * actions header, where the gear lines up with the row buttons under it — or, when there
   * is no actions column either, to a leading column of its own. That last case keeps the
   * gear at the same fixed spot at the start of the header as the selection cell gives it,
   * rather than stranding it past the last column of a wide read-only report.
   */
  const settingsInSelectionColumn = showColumnSettings && selectable;

  const settingsInActionsColumn =
    showColumnSettings &&
    !settingsInSelectionColumn &&
    !settingsLeading &&
    visibleColumns.length > 0 &&
    isMetaColumn(visibleColumns[visibleColumns.length - 1]);

  /** The trailing column of its own, once neither host above is available. */
  const settingsInOwnColumn =
    showColumnSettings &&
    !settingsInSelectionColumn &&
    !settingsInActionsColumn;

  /**
   * `settingsInOwnColumn` placed after the first data column rather than leading the table.
   * Only meaningful combined with `settingsInOwnColumn`; a table that hosts the gear in the
   * selection or actions column ignores this anchor entirely.
   */
  const settingsAfterFirstColumn =
    settingsInOwnColumn &&
    settingsColumnAnchor === "afterFirstColumn" &&
    // Inside a grouped header the gear would split the first column's group, so it leads.
    normalizeHeaderGroup(visibleColumns[0]?.headerGroup).length === 0;

  /** The header's column order, as `footer` receives it: `null` marks a non-data slot. */
  const footerColumnKeys = useMemo(() => {
    const keys: Array<string | null> = visibleColumns.map(
      (column) => column.key,
    );
    if (settingsAfterFirstColumn) keys.splice(1, 0, null);
    else if (settingsInOwnColumn) keys.unshift(null);
    if (selectable) keys.unshift(null);
    return keys;
  }, [
    visibleColumns,
    settingsAfterFirstColumn,
    settingsInOwnColumn,
    selectable,
  ]);

  /**
   * Column widths the user dragged. A list with a preference key stores them on the account
   * once the drag ends, so the list comes back at the same layout after leaving the screen or
   * signing out; any other table keeps them for this visit only.
   */
  const { columnWidths, layoutLocked, startResize } =
    useColumnResize(preferences);

  const tableRef = useRef<HTMLTableElement>(null);
  /**
   * Left offset of each pinned data column, measured from the rendered header.
   *
   * The declared widths are only a fallback: a column may declare none, and a column the
   * reader has just brought back out of hiding has no measured width of its own yet. Both
   * cases would place the pinned columns on top of each other, so what the browser actually
   * laid out is read back instead, and re-read whenever the table's box changes.
   */
  const [measuredOffsets, setMeasuredOffsets] = useState<number[] | null>(null);
  /**
   * Left offset of the `afterFirstColumn` gear once it joins the pinned chain (two or more
   * frozen columns). `null` while it is not itself pinned, so `stickyMeta` falls back to
   * leaving it unpinned rather than sticking it at a stale position.
   */
  const [measuredGearOffset, setMeasuredGearOffset] = useState<number | null>(
    null,
  );
  /** False while the pinned chain would cover too much of the visible width to scroll past. */
  const [pinnedColumnsFit, setPinnedColumnsFit] = useState(true);

  const lastColumnKey = visibleColumns[visibleColumns.length - 1]?.key;

  const getColumnStyle = useCallback(
    (col: TableColumn<T>): React.CSSProperties => {
      // A fitted table never ends short of its container: its last column takes no width of
      // its own, so it absorbs whatever the other columns leave (see `lockedTableStyle`).
      if (fitColumnWidths && layoutLocked && col.key === lastColumnKey) {
        return { ...col.style, width: undefined, minWidth: undefined };
      }
      return { ...col.style, ...resizedColumnStyle(columnWidths[col.key]) };
    },
    [columnWidths, fitColumnWidths, layoutLocked, lastColumnKey],
  );

  /** Sum of every rendered column once locked — what `fitColumnWidths` sizes the table to. */
  const lockedTableWidth = useMemo(
    () =>
      visibleColumns.reduce(
        (total, col) =>
          total + (columnWidths[col.key] ?? resolveColumnWidth(col.style)),
        0,
      ),
    [columnWidths, visibleColumns],
  );

  const hiddenColumnCount = showColumnSettings
    ? hideableKeys.filter((key) => !preferences.isVisible(key)).length
    : 0;

  const widthWithoutSettings = selectable ? SELECTABLE_COLUMN_WIDTH : 0;
  const settingsColumnWidth =
    hiddenColumnCount > 0
      ? SELECTABLE_WITH_SETTINGS_BADGE_COLUMN_WIDTH
      : SELECTABLE_WITH_SETTINGS_COLUMN_WIDTH;
  const selectionColumnWidth = settingsInSelectionColumn
    ? settingsColumnWidth
    : widthWithoutSettings;

  /**
   * What a sticky data column has to clear on the left: its own gear column, when there is
   * one and it actually leads the table — a gear anchored after the first column instead
   * contributes nothing here, since it is no longer part of the leading strip.
   */
  const leadingMetaWidth =
    selectionColumnWidth +
    (settingsInOwnColumn && !settingsAfterFirstColumn
      ? SETTINGS_COLUMN_WIDTH
      : 0);

  const settingsOptions = useMemo(
    () =>
      hideableColumns.map((column) => {
        const header = resolveColumnFilterLabel(column);
        const metaLabelKey = META_COLUMN_LABEL_KEYS[column.key];
        return {
          key: column.key,
          label: header || (metaLabelKey ? t(metaLabelKey) : column.key),
        };
      }),
    [hideableColumns, t],
  );

  const columnSettingsControl = showColumnSettings ? (
    <TableColumnSettings
      options={settingsOptions}
      visibleKeys={preferences.visibleColumns}
      onToggle={preferences.toggle}
      onShowAll={preferences.showAll}
      onHideAll={preferences.hideAll}
      frozenKey={preferences.frozenColumn}
      onFreeze={preferences.setFrozenColumn}
    />
  ) : null;

  const filterableColumnKeys = useMemo(
    () =>
      showColumnFilters
        ? new Set(
            visibleColumns
              .filter((column) => isColumnFilterable(column))
              .map((column) => column.key),
          )
        : new Set<string>(),
    [visibleColumns, showColumnFilters],
  );

  const activeFilters = useMemo<ActiveColumnFilter[]>(() => {
    if (!showColumnFilters) return [];
    return visibleColumns
      .filter(
        (column) =>
          isColumnFilterable(column) &&
          (columnFilters[resolveColumnFilterKey(column)]?.length ?? 0) > 0,
      )
      .map((column) => {
        const key = resolveColumnFilterKey(column);
        return {
          key,
          label: resolveColumnFilterLabel(column) || key,
          count: columnFilters[key]?.length ?? 0,
        };
      });
  }, [visibleColumns, columnFilters, showColumnFilters]);

  const handleFilterChange = (columnKey: string, selected: string[]) => {
    onColumnFiltersChange?.(
      withColumnSelection(columnFilters, columnKey, selected),
    );
  };

  const sortableColumnKeys = useMemo(
    () =>
      showSort
        ? new Set(
            visibleColumns
              .filter((column) => isColumnSortable(column))
              .map((column) => column.key),
          )
        : new Set<string>(),
    [visibleColumns, showSort],
  );

  const handleSortToggle = (columnKey: string) => {
    onSortChange?.(nextSortState(sort, columnKey));
  };

  /**
   * How many leading columns are pinned: the account's own choice when it froze one, and
   * otherwise whatever the list declared. A frozen column the table no longer renders — one
   * hidden, or gone with a permission — pins nothing, so the declared value stands again.
   */
  const frozenLeadingColumns = useMemo(() => {
    if (!preferences.frozenColumn) return fixedLeadingColumns;
    const position = visibleColumns.findIndex(
      (column) => column.key === preferences.frozenColumn,
    );
    return position >= 0 ? position + 1 : fixedLeadingColumns;
  }, [fixedLeadingColumns, preferences.frozenColumn, visibleColumns]);

  /** Data columns are preceded by the selection cell and the gear's own column, if any. */
  const leadingCellCount =
    (selectable ? 1 : 0) +
    (settingsInOwnColumn && !settingsAfterFirstColumn ? 1 : 0);

  /**
   * Reads the pinned columns' offsets back out of the rendered header.
   *
   * Re-measured whenever the pinned set, the column set or a dragged width changes, and
   * whenever the table's own box does — a column brought back out of hiding has no measured
   * width until it has been drawn once, and an offset computed without it would stack the
   * pinned columns on top of one another.
   */
  useEffect(() => {
    const measure = () => {
      const table = tableRef.current;
      if (!table || frozenLeadingColumns === undefined) return;
      if (frozenLeadingColumns <= 0) {
        setMeasuredOffsets((previous) => (previous === null ? previous : null));
        setMeasuredGearOffset((previous) =>
          previous === null ? previous : null,
        );
        return;
      }

      // Leading cells span every header row, so they all sit in the first one; a data column's
      // own cell may sit in a lower row under its group, so it is found by its key instead.
      const headerRow = table.querySelector("thead tr");
      const cells = Array.from(headerRow?.children ?? []) as HTMLElement[];
      if (cells.length === 0) return;
      const leafByKey = new Map<string, HTMLElement>();
      table
        .querySelectorAll<HTMLElement>("thead th[data-col-key]")
        .forEach((cell) => {
          if (cell.dataset.colKey) leafByKey.set(cell.dataset.colKey, cell);
        });

      const next: number[] = [];
      let nextGearOffset: number | null = null;
      let left = 0;
      for (let index = 0; index < leadingCellCount; index += 1) {
        left += cells[index]?.getBoundingClientRect().width ?? 0;
      }
      for (let index = 0; index < frozenLeadingColumns; index += 1) {
        const cell = leafByKey.get(visibleColumns[index]?.key ?? "");
        if (!cell) break;
        next.push(left);
        left += cell.getBoundingClientRect().width;
        // The gear anchored after the first column only joins the pinned chain once a second
        // column is also frozen; otherwise nothing pins past it, so it stays unpinned.
        if (
          index === 0 &&
          settingsAfterFirstColumn &&
          frozenLeadingColumns >= 2
        ) {
          nextGearOffset = left;
          left +=
            table
              .querySelector<HTMLElement>("thead th[data-settings-after-first]")
              ?.getBoundingClientRect().width ?? 0;
        }
      }

      setMeasuredOffsets((previous) =>
        previous !== null &&
        previous.length === next.length &&
        previous.every((value, index) => value === next[index])
          ? previous
          : next,
      );
      setMeasuredGearOffset((previous) =>
        previous === nextGearOffset ? previous : nextGearOffset,
      );
      const visibleWidth = table.parentElement?.clientWidth ?? 0;
      setPinnedColumnsFit(
        visibleWidth === 0 || left <= visibleWidth * MAX_PINNED_WIDTH_SHARE,
      );
    };

    measure();

    const table = tableRef.current;
    if (!table || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(table);
    if (table.parentElement) observer.observe(table.parentElement);
    return () => observer.disconnect();
  }, [
    frozenLeadingColumns,
    leadingCellCount,
    visibleColumns,
    columnWidths,
    settingsAfterFirstColumn,
  ]);

  const stickyMeta = useMemo(() => {
    if (!pinnedColumnsFit) return null;
    const declared = buildStickyMeta(
      visibleColumns,
      frozenLeadingColumns,
      leadingMetaWidth,
      (col) => columnWidths[col.key] ?? resolveColumnWidth(col.style),
      settingsAfterFirstColumn ? SETTINGS_COLUMN_WIDTH : undefined,
    );
    if (!declared) return null;
    // The measurement wins once it exists; the declared widths only carry the first paint.
    const offsets =
      measuredOffsets && measuredOffsets.length === declared.count
        ? measuredOffsets
        : declared.offsets;
    const gearOffset =
      declared.gearOffset === undefined
        ? undefined
        : (measuredGearOffset ?? declared.gearOffset);
    return { count: declared.count, offsets, gearOffset };
  }, [
    visibleColumns,
    frozenLeadingColumns,
    leadingMetaWidth,
    columnWidths,
    measuredOffsets,
    measuredGearOffset,
    settingsAfterFirstColumn,
    pinnedColumnsFit,
  ]);

  // Consecutive rows sharing a group key form one record: the first row of the group carries
  // its spanning cells, the rest carry only their own line.
  const rowGroups = data.map((item, index) => {
    if (!rowGroupKey) return { isStart: true, size: 1 };
    const key = rowGroupKey(item);
    const isStart = index === 0 || rowGroupKey(data[index - 1]) !== key;
    if (!isStart) return { isStart: false, size: 1 };
    let size = 1;
    while (
      index + size < data.length &&
      rowGroupKey(data[index + size]) === key
    ) {
      size += 1;
    }
    return { isStart: true, size };
  });

  // A record ticked once stays one entry, however many lines it was drawn across. Rows a bulk
  // action may not touch are left out entirely, so "select all" cannot reach them either.
  const allRowKeys = [
    ...new Set(
      data
        .filter((item) => !isRowSelectable || isRowSelectable(item))
        .map(rowKey)
        .filter(Boolean),
    ),
  ];

  /**
   * A list with bulk actions acts on the page in view only: a row that left it — another
   * page, a filter, a deleted record — drops out of the selection, so the count in the bar is
   * always what the user sees ticked. Pickers carry no bulk actions and keep their picks
   * across searches.
   */
  const pageKeySignature = allRowKeys.join("\u0000");
  const keepsSelectionToPage = selectionActions !== undefined;
  useEffect(() => {
    if (!onSelectionChange || !keepsSelectionToPage) return;
    const pageKeys = new Set(
      pageKeySignature ? pageKeySignature.split("\u0000") : [],
    );
    const kept = selectedKeys.filter((key) => pageKeys.has(key));
    if (kept.length !== selectedKeys.length) onSelectionChange(kept);
  }, [pageKeySignature, keepsSelectionToPage, selectedKeys, onSelectionChange]);

  /** Ticks or unticks every selectable row of this page. */
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    const pageKeys = new Set(allRowKeys);
    const offPage = selectedKeys.filter((key) => !pageKeys.has(key));
    onSelectionChange(e.target.checked ? [...offPage, ...allRowKeys] : offPage);
  };

  /** Ticks or unticks several keys in one change, as a card holding a whole record does. */
  const handleSelectKeys = (keys: string[], checked: boolean) => {
    if (!onSelectionChange) return;
    const rest = selectedKeys.filter((key) => !keys.includes(key));
    onSelectionChange(checked ? [...rest, ...keys] : rest);
  };

  const handleSelectRow = (key: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedKeys, key]);
    } else {
      onSelectionChange(selectedKeys.filter((k) => k !== key));
    }
  };

  const isAllSelected =
    data.length > 0 && allRowKeys.every((key) => selectedKeys.includes(key));
  const isSomeSelected =
    data.length > 0 &&
    allRowKeys.some((key) => selectedKeys.includes(key)) &&
    !isAllSelected;

  const getStickyColumnProps = (
    colIdx: number,
    variant: "head" | "body",
    isSelected = false,
  ) => {
    if (!stickyMeta || colIdx >= stickyMeta.count) {
      return { className: undefined, style: undefined };
    }

    const isLastFixed = colIdx === stickyMeta.count - 1;

    return {
      className: cn(
        "sticky",
        variant === "head"
          ? "z-[3] bg-surface-secondary"
          : cn(
              "z-[2] bg-surface-primary group-hover:bg-[#f7f9ff]",
              isSelected && "bg-brand-50 group-hover:bg-brand-50",
            ),
        isLastFixed &&
          "shadow-[4px_0_8px_-4px_rgba(15,23,42,0.15)] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border-secondary",
      ),
      style: { left: stickyMeta.offsets[colIdx] },
    };
  };

  /**
   * Sticky props for the `afterFirstColumn` gear cell, once it has joined the pinned chain
   * (see {@link buildStickyMeta}). Same z-index and background treatment as a pinned data
   * column, since it now sits inside that chain rather than ahead of it.
   */
  const getGearStickyProps = (variant: "head" | "body", isSelected = false) => {
    if (!stickyMeta || stickyMeta.gearOffset === undefined) {
      return { className: undefined, style: undefined };
    }

    return {
      className: cn(
        "sticky",
        variant === "head"
          ? "z-[3] bg-surface-secondary"
          : cn(
              "z-[2] bg-surface-primary group-hover:bg-[#f7f9ff]",
              isSelected && "bg-brand-50 group-hover:bg-brand-50",
            ),
      ),
      style: { left: stickyMeta.gearOffset },
    };
  };

  /**
   * One `<col>` per rendered column, in the exact DOM order the header/body cells draw them.
   *
   * A grouped header's top rows carry only `colSpan` cells with no width of their own, so a
   * browser laying the table out as `table-layout: fixed` cannot take leaf widths from the
   * first row the way it does for an ungrouped table — it must read them from `<colgroup>`
   * instead. Rendered for every grouped table, and for a locked ungrouped one too so resize
   * keeps working the same way regardless of what set `layoutLocked`.
   */
  const colgroupColumns = useMemo(() => {
    const cols: Array<{ key: string; width: React.CSSProperties["width"] }> =
      [];
    if (selectable) {
      cols.push({ key: "__selection", width: selectionColumnWidth });
    }
    if (settingsInOwnColumn && !settingsAfterFirstColumn) {
      cols.push({ key: "__settings-leading", width: SETTINGS_COLUMN_WIDTH });
    }
    visibleColumns.forEach((col, idx) => {
      cols.push({
        key: col.key || `col-${idx}`,
        width: getColumnStyle(col).width,
      });
      if (settingsAfterFirstColumn && idx === 0) {
        cols.push({
          key: "__settings-after-first",
          width: SETTINGS_COLUMN_WIDTH,
        });
      }
    });
    return cols;
  }, [
    selectable,
    selectionColumnWidth,
    settingsInOwnColumn,
    settingsAfterFirstColumn,
    visibleColumns,
    getColumnStyle,
  ]);
  const showColgroup = headerLayout.depth > 0 || layoutLocked;

  let lockedTableStyle: React.CSSProperties | undefined;
  if (layoutLocked) {
    // Exactly the sum of the columns once that overflows the container, so a column dragged
    // narrower really narrows; never less than the container, or the dialog shows a blank
    // strip beside the table — the last column fills that instead.
    lockedTableStyle = fitColumnWidths
      ? {
          tableLayout: "fixed",
          width: `max(${
            lockedTableWidth +
            selectionColumnWidth +
            (settingsInOwnColumn ? SETTINGS_COLUMN_WIDTH : 0)
          }px, 100%)`,
          minWidth: 0,
        }
      : { tableLayout: "fixed" };
  }

  const tableElement = (
    <table
      ref={tableRef}
      className={cn(
        "w-full border-separate border-spacing-0 text-[13px]",
        tableClassName,
      )}
      style={lockedTableStyle}
    >
      {showColgroup && (
        <colgroup>
          {colgroupColumns.map((col) => (
            <col
              key={col.key}
              style={col.width !== undefined ? { width: col.width } : undefined}
            />
          ))}
        </colgroup>
      )}
      <thead className="sticky top-0 z-[5] bg-surface-secondary">
        {headerLayout.rows.map((cells, rowIndex) => (
          <tr key={rowIndex}>
            {rowIndex === 0 && selectable && (
              <th
                rowSpan={headerRowSpan}
                className={cn(
                  "border-b border-border-secondary py-2.5 text-left text-xs font-bold uppercase tracking-wide text-text-secondary",
                  // The gear needs the room the padding would take, so the cell tightens on
                  // the right and the flex row below keeps the checkbox where it always was.
                  settingsInSelectionColumn ? "pl-3.5 pr-1.5" : "px-3.5",
                  stickyMeta && "sticky left-0 z-[4] bg-surface-secondary",
                )}
                style={
                  stickyMeta
                    ? {
                        width: selectionColumnWidth,
                        minWidth: selectionColumnWidth,
                        maxWidth: selectionColumnWidth,
                      }
                    : { width: selectionColumnWidth }
                }
              >
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-[13px] w-[13px] cursor-pointer accent-brand"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = isSomeSelected;
                      }
                    }}
                    onChange={handleSelectAll}
                  />
                  {settingsInSelectionColumn ? columnSettingsControl : null}
                </span>
              </th>
            )}
            {rowIndex === 0 &&
            settingsInOwnColumn &&
            !settingsAfterFirstColumn ? (
              <th
                rowSpan={headerRowSpan}
                className={cn(
                  "border-b border-border-secondary px-2 py-2.5 text-center align-middle",
                  stickyMeta && "sticky left-0 z-[4] bg-surface-secondary",
                )}
                style={{
                  width: SETTINGS_COLUMN_WIDTH,
                  minWidth: SETTINGS_COLUMN_WIDTH,
                }}
              >
                {columnSettingsControl}
              </th>
            ) : null}
            {cells.map((cell) => {
              if (cell.type === "group") {
                return (
                  <th
                    key={`group-${rowIndex}-${cell.colIndex}`}
                    colSpan={cell.colSpan}
                    scope="colgroup"
                    className={cn(
                      layoutLocked ? "break-words" : "whitespace-nowrap",
                      "border-b border-border-secondary px-3.5 py-2 text-center text-xs font-bold uppercase tracking-wide text-text-secondary",
                    )}
                  >
                    {cell.label}
                  </th>
                );
              }
              const idx = cell.colIndex;
              const col = visibleColumns[idx];
              const sticky = getStickyColumnProps(idx, "head");

              return (
                <React.Fragment key={col.key || idx}>
                  <th
                    data-col-key={col.key}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                    className={cn(
                      "relative border-b border-border-secondary px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-text-secondary",
                      !layoutLocked && "whitespace-nowrap",
                      col.className,
                      sticky.className,
                    )}
                    style={{ ...getColumnStyle(col), ...sticky.style }}
                  >
                    <span
                      className={cn(
                        "inline-flex max-w-full items-center gap-1",
                        // The gear belongs at the very end of the actions column, past the
                        // buttons below it, rather than tucked against the header text.
                        settingsInActionsColumn &&
                          idx === visibleColumns.length - 1 &&
                          "flex w-full justify-end",
                      )}
                    >
                      {renderHeaderContent(col.header, layoutLocked)}
                      {settingsInActionsColumn &&
                      idx === visibleColumns.length - 1
                        ? columnSettingsControl
                        : null}
                      {sortableColumnKeys.has(col.key) ? (
                        <TableSortControl
                          columnLabel={resolveColumnFilterLabel(col) || col.key}
                          direction={
                            sort?.key === resolveColumnSortKey(col)
                              ? sort.direction
                              : undefined
                          }
                          onToggle={() =>
                            handleSortToggle(resolveColumnSortKey(col))
                          }
                        />
                      ) : null}
                      {filterableColumnKeys.has(col.key) &&
                      (columnFilterEndpoint || localColumnValues) ? (
                        <TableColumnFilter
                          columnLabel={resolveColumnFilterLabel(col) || col.key}
                          column={resolveColumnFilterKey(col)}
                          endpoint={columnFilterEndpoint}
                          params={columnFilterParams}
                          filters={columnFilters}
                          localValues={
                            columnFilterEndpoint
                              ? undefined
                              : localColumnValues?.(resolveColumnFilterKey(col))
                          }
                          selected={
                            columnFilters[resolveColumnFilterKey(col)] ?? []
                          }
                          labelForValue={col.filterLabel}
                          compareValues={col.filterValueOrder}
                          onChange={(selected) =>
                            handleFilterChange(
                              resolveColumnFilterKey(col),
                              selected,
                            )
                          }
                        />
                      ) : null}
                    </span>
                    <ColumnResizeHandle onMouseDown={startResize(col.key)} />
                  </th>
                  {settingsAfterFirstColumn && idx === 0
                    ? (() => {
                        const gearSticky = getGearStickyProps("head");
                        return (
                          <th
                            data-settings-after-first
                            rowSpan={headerRowSpan}
                            className={cn(
                              "border-b border-border-secondary px-2 py-2.5 text-center align-middle",
                              gearSticky.className,
                            )}
                            style={{
                              width: SETTINGS_COLUMN_WIDTH,
                              minWidth: SETTINGS_COLUMN_WIDTH,
                              ...gearSticky.style,
                            }}
                          >
                            {columnSettingsControl}
                          </th>
                        );
                      })()
                    : null}
                </React.Fragment>
              );
            })}
          </tr>
        ))}
      </thead>
      {(() => {
        // One <tbody className="group"> per row group: a group's rows are physically separate
        // <tr>s, but `group-hover:` only reaches every one of them (including the spanning
        // cell drawn once on the group's first row) when they share this common ancestor.
        // Scoping hover to a single <tr> instead left a multi-line record's shared columns
        // (its totals, status, actions) unlit while hovering any line but the first.
        const batches: number[][] = [];
        data.forEach((_, index) => {
          if (rowGroups[index].isStart) {
            batches.push([index]);
          } else {
            batches[batches.length - 1].push(index);
          }
        });

        return batches.map((rowIndices) => (
          <tbody
            key={`${rowKey(data[rowIndices[0]]) || "row"}-${rowIndices[0]}`}
            className="group"
          >
            {rowIndices.map((rowIdx) => {
              const item = data[rowIdx];
              const key = rowKey(item);
              const isSelected = selectedKeys.includes(key);
              const isDisabled = isRowDisabled?.(item) ?? false;
              const group = rowGroups[rowIdx];

              return (
                <tr
                  key={`${key || "row"}-${rowIdx}`}
                  aria-disabled={isDisabled || undefined}
                  className={cn(
                    isDisabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer",
                    isSelected && "[&>td]:bg-brand-50",
                    !isSelected && rowClassName?.(item),
                  )}
                  onClick={
                    activateRowOn === "single" && !isDisabled
                      ? (e) => {
                          if (isFromRowControl(e)) return;
                          onRowClick?.(item, rowIdx);
                        }
                      : undefined
                  }
                  onDoubleClick={
                    activateRowOn === "double" && !isDisabled
                      ? (e) => {
                          if (isFromRowControl(e)) return;
                          onRowClick?.(item, rowIdx);
                        }
                      : undefined
                  }
                >
                  {settingsInOwnColumn &&
                  !settingsAfterFirstColumn &&
                  group.isStart ? (
                    <td
                      rowSpan={group.size > 1 ? group.size : undefined}
                      className={cn(
                        "border-b border-border-tertiary px-2 py-2.5",
                        rowIdx === data.length - 1 && "border-b-0",
                        !isSelected && "group-hover:bg-[#f7f9ff]",
                        stickyMeta &&
                          "sticky left-0 z-[4] bg-surface-primary group-hover:bg-[#f7f9ff]",
                      )}
                      style={{
                        width: SETTINGS_COLUMN_WIDTH,
                        minWidth: SETTINGS_COLUMN_WIDTH,
                      }}
                    />
                  ) : null}
                  {selectable && (selectionPerRow || group.isStart) && (
                    <td
                      rowSpan={
                        !selectionPerRow && group.size > 1
                          ? group.size
                          : undefined
                      }
                      className={cn(
                        "border-b border-border-tertiary px-3.5 py-2.5 align-middle text-text-primary",
                        !isSelected && "group-hover:bg-[#f7f9ff]",
                        stickyMeta && "sticky left-0 z-[4] bg-surface-primary",
                        isSelected &&
                          stickyMeta &&
                          "bg-brand-50 group-hover:bg-brand-50",
                      )}
                      style={
                        stickyMeta
                          ? {
                              width: selectionColumnWidth,
                              minWidth: selectionColumnWidth,
                              maxWidth: selectionColumnWidth,
                            }
                          : undefined
                      }
                      onClick={(e) => e.stopPropagation()}
                      // Ticking twice quickly is a double-click too; it must never open the row.
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {!isRowSelectable || isRowSelectable(item) ? (
                        <input
                          type="checkbox"
                          className={cn(
                            "h-[13px] w-[13px] accent-brand",
                            isDisabled
                              ? "cursor-not-allowed"
                              : "cursor-pointer",
                          )}
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={(e) =>
                            handleSelectRow(key, e.target.checked)
                          }
                        />
                      ) : null}
                    </td>
                  )}
                  {visibleColumns.map((col, colIdx) => {
                    if (col.groupSpan && !group.isStart) return null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const val = (item as any)[col.key];
                    const sticky = getStickyColumnProps(
                      colIdx,
                      "body",
                      isSelected,
                    );
                    const spans = Boolean(col.groupSpan) && group.size > 1;
                    const cellContent = col.render
                      ? col.render(val, item, rowIdx)
                      : (val as React.ReactNode);

                    return (
                      <React.Fragment key={col.key || colIdx}>
                        <td
                          rowSpan={spans ? group.size : undefined}
                          className={cn(
                            "relative overflow-hidden border-b border-border-tertiary px-3.5 py-2.5 text-[13px] text-text-primary",
                            "align-middle",
                            rowIdx === data.length - 1 && "border-b-0",
                            !isSelected && "group-hover:bg-[#f7f9ff]",
                            col.className,
                            sticky.className,
                          )}
                          style={{ ...getColumnStyle(col), ...sticky.style }}
                        >
                          {/* Natural widths keep every value on one line; once the reader
                              sizes the columns, a value wider than its column wraps. See
                              `.table-cell-nowrap` / `.table-cell-wrap` in `globals.css`. */}
                          <div className={tableCellWrapClass(layoutLocked)}>
                            {cellContent}
                          </div>
                        </td>
                        {settingsAfterFirstColumn &&
                        colIdx === 0 &&
                        group.isStart
                          ? (() => {
                              const gearSticky = getGearStickyProps(
                                "body",
                                isSelected,
                              );
                              return (
                                <td
                                  data-settings-after-first
                                  rowSpan={
                                    group.size > 1 ? group.size : undefined
                                  }
                                  className={cn(
                                    "border-b border-border-tertiary px-2 py-2.5",
                                    rowIdx === data.length - 1 && "border-b-0",
                                    !isSelected && "group-hover:bg-[#f7f9ff]",
                                    gearSticky.className,
                                  )}
                                  style={{
                                    width: SETTINGS_COLUMN_WIDTH,
                                    minWidth: SETTINGS_COLUMN_WIDTH,
                                    ...gearSticky.style,
                                  }}
                                />
                              );
                            })()
                          : null}
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ));
      })()}
      {data.length === 0 && !isEmptyRowOwnedOutside && (
        <tbody>
          <tr>
            <td
              colSpan={
                visibleColumns.length +
                (selectable ? 1 : 0) +
                (settingsInOwnColumn ? 1 : 0)
              }
              className="px-[11px] py-5 text-center text-text-secondary"
            >
              {resolvedEmptyText}
            </td>
          </tr>
        </tbody>
      )}
      {data.length > 0 && footer ? (
        <tfoot>
          {footer(
            visibleColumns.length +
              (selectable ? 1 : 0) +
              (settingsInOwnColumn ? 1 : 0),
            footerColumnKeys,
          )}
        </tfoot>
      ) : null}
    </table>
  );

  const body = showCards ? (
    <TableMobileCardList
      columns={visibleColumns}
      data={data}
      rowKey={rowKey}
      // One card per row, as the table draws one row per line: each line keeps its own tick,
      // figures and actions. Pass `rowGroupKey` here to gather a record's lines into one card.
      selectable={selectable}
      selectedKeys={selectedKeys}
      isRowSelectable={isRowSelectable}
      onSelectKeys={handleSelectKeys}
      selectAll={{
        checked: isAllSelected,
        indeterminate: isSomeSelected,
        count: allRowKeys.length,
        onChange: (checked) => handleSelectKeys(allRowKeys, checked),
      }}
      onRowClick={onRowClick}
      isRowDisabled={isRowDisabled}
      rowClassName={rowClassName}
      emptyText={isEmptyRowOwnedOutside ? null : resolvedEmptyText}
    />
  ) : (
    tableElement
  );

  const summaryBar = showColumnFilters ? (
    <TableColumnFilterSummary
      filters={activeFilters}
      onClearColumn={(key) => handleFilterChange(key, [])}
      onClearAll={() => onColumnFiltersChange?.({})}
    />
  ) : null;

  const selectionBar = selectable ? (
    <TableSelectionBar
      count={selectedKeys.length}
      onClear={() => onSelectionChange?.([])}
      actions={selectionActions}
      placement={showCards ? "bottom" : "top"}
    />
  ) : null;

  if (noWrapper) {
    return (
      <>
        {summaryBar}
        {selectionBar}
        {body}
      </>
    );
  }

  /**
   * The summary sits outside the horizontal scroller: inside it, a table wider than the
   * screen would carry the filter chips and their clear-all sideways out of view.
   */
  return (
    <ListTableFrame
      // Cards sit straight on the page, as their own white blocks, rather than in the table's card.
      className={cn(
        wrapperClassName,
        showCards && "rounded-none border-0 bg-transparent",
      )}
      header={
        <>
          {summaryBar}
          {showCards ? null : selectionBar}
        </>
      }
      // A phone keeps the bulk actions at the bottom, within reach of the thumb.
      footer={showCards ? selectionBar : null}
    >
      {body}
    </ListTableFrame>
  );
}
