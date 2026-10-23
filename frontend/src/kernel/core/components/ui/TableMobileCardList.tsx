"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";

import { cn } from "@/kernel/core/lib/cn";
import { resolveColumnFilterLabel } from "@/kernel/core/lib/table-column-filter";

import type {
  TableColumn,
  TableColumnMobile,
} from "@/kernel/core/components/ui/Table";

/** Fields a card (or a card's line) shows before the rest fold behind "show more". */
const VISIBLE_FIELD_COUNT = 4;

/** Lines a grouped card shows before the rest fold behind "show more lines". */
const VISIBLE_LINE_COUNT = 2;

/** Controls that act on their own and must never also open the card they sit in. */
const CARD_CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, label, [role="button"], [role="checkbox"], [role="menuitem"]';

/** A value right-aligned for its table column would float away from its caption on a card. */
const ALIGN_START =
  "[&_.items-end]:items-start [&_.justify-end]:justify-start [&_.text-right]:text-left";

/**
 * A cell clipped to its table column's width shows its whole value on a card, which has the
 * room to wrap it instead.
 */
const UNCLIP =
  "[&_*]:max-w-none [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal [&_.whitespace-nowrap]:!whitespace-normal [&_*]:break-words";

/**
 * The table's icon-only row actions, redrawn as equal-width buttons that print their label
 * beside the icon: a phone has no hover to reveal what a bare icon does. A button names itself
 * by its tooltip, or by a shorter `data-card-label` when three must share a row; one marked
 * `data-card-primary` is the step the record is waiting for. Anything that is not a button —
 * a tag such as "automatic" — keeps its own size.
 */
const ACTIONS = cn(
  "[&:not(:has(button,span))]:hidden",
  // Equal widths, at most three to a row: a fourth button wraps rather than squeezing every
  // label down to a few letters.
  "[&>div]:grid [&>div]:w-full [&>div]:grid-cols-[repeat(auto-fit,minmax(max(96px,calc((100%-12px)/3)),1fr))] [&>div]:gap-1.5",
  "[&>div>:not(button)]:self-center [&>div>:not(button)]:justify-self-start",
  // A greyed-out placeholder (a delete the row may not take) is only a tooltip on a desk; on a
  // card it would read as a broken button, so the card shows the actions it can take.
  "[&>div>[aria-disabled=true]]:hidden [&_button:disabled]:hidden",
  // A cell's own marker for what only the table needs (a status the card's chip already says).
  "[&_[data-card-hidden]]:hidden",
  // Icon and label side by side, centred, whatever display the table gave the button.
  "[&_button]:!inline-flex [&_button]:!items-center [&_button]:!justify-center",
  "[&_button]:!w-full [&_button]:min-w-0 [&_button]:!gap-1.5 [&_button]:!rounded-lg [&_button]:!px-2 [&_button]:text-[length:var(--card-fs-button)] [&_button]:font-medium",
  // A long label ("Adjust SO balance") wraps onto a second line rather than being cut, and
  // never squeezes the icon beside it.
  "[&_button]:!h-auto [&_button]:min-h-[38px] [&_button]:py-1 [&_button_svg]:shrink-0 [&_button>span:has(>svg)]:shrink-0",
  "[&_button]:after:min-w-0 [&_button]:after:break-words [&_button]:after:text-center [&_button]:after:leading-tight [&_button]:after:content-[attr(title)]",
  "[&_button[data-card-label]]:after:content-[attr(data-card-label)]",
  "[&_button[data-card-primary]]:!border-purple-700 [&_button[data-card-primary]]:!bg-purple-700 [&_button[data-card-primary]]:font-semibold [&_button[data-card-primary]]:!text-white",
  // A long-labelled button spans the row and goes last; so does its wrapper, when a permission
  // gate or the like is what sits in the grid.
  "[&_button[data-card-wide]]:order-last [&>div>:has(button[data-card-wide])]:order-last",
  "[&_button[data-card-wide=full]]:col-span-full [&>div>:has(button[data-card-wide=full])]:col-span-full",
  "[&_button[data-card-wide='2']]:col-span-2 [&>div>:has(button[data-card-wide='2'])]:col-span-2",
);

/** Characters a card button's label may run to and still share its row with others. */
const WIDE_ACTION_LABEL_LENGTH = 12;

/** A line's actions inside a card of several lines: a step smaller than the card's own. */
const LINE_ACTIONS =
  "[&_button]:min-h-[34px] [&_button]:text-[length:var(--card-fs-caption)]";

/**
 * Buttons whose icon says plainly what they do get that one word on a card — "Delete", not
 * "Delete this material line from the issue" — while their tooltip keeps the full sentence.
 * Keyed by the Tabler icon class the `Icon` renders.
 */
export const ICON_CARD_LABEL_KEYS: Record<string, string> = {
  "tabler-icon-trash": "cardActionDelete",
  "tabler-icon-edit": "cardActionEdit",
  "tabler-icon-pencil": "cardActionEdit",
  "tabler-icon-eye": "cardActionView",
  "tabler-icon-printer": "cardActionPrint",
  "tabler-icon-check": "cardActionApprove",
  "tabler-icon-circle-check": "cardActionApprove",
  "tabler-icon-ban": "cancel",
  "tabler-icon-lock": "close",
};

/**
 * The record's chips — status, week, classification — come from columns drawn for a table, each
 * pill a little different in height, padding and type size. On one row of a card that reads as
 * ragged, so the row gives every pill in it the same size, however deep a column wrapped it (an
 * empty one is a badge's status dot, left as it is).
 */
const CHIP_ROW = cn(
  "flex flex-wrap items-center gap-x-3 gap-y-1.5",
  "[&>.rounded-md]:inline-flex [&>.rounded-md]:!h-[calc(var(--card-fs-caption)+11px)] [&>.rounded-md]:items-center [&>.rounded-md]:!rounded-full [&>.rounded-md]:!px-2 [&>.rounded-md]:!py-0 [&>.rounded-md]:!text-[length:var(--card-fs-caption)] [&>.rounded-md]:!font-semibold [&>.rounded-md]:!leading-none",
  "[&_.rounded-full:not(:empty)]:inline-flex [&_.rounded-full:not(:empty)]:!h-[calc(var(--card-fs-caption)+11px)] [&_.rounded-full:not(:empty)]:items-center [&_.rounded-full:not(:empty)]:!rounded-full [&_.rounded-full:not(:empty)]:!px-2 [&_.rounded-full:not(:empty)]:!py-0 [&_.rounded-full:not(:empty)]:!text-[length:var(--card-fs-caption)] [&_.rounded-full:not(:empty)]:!font-semibold [&_.rounded-full:not(:empty)]:!leading-none",
);

/** The chips' own grid when they keep a row: two columns, like the field grid under them. */
const CHIP_GRID = cn(
  "!grid grid-cols-2 !items-start !gap-x-1.5 !gap-y-2 [&>*]:pr-1.5",
  // A long value ("Returned from the workshop") wraps inside its own column instead of
  // running into the next one.
  "[&_.rounded-full:not(:empty)]:!h-auto [&_.rounded-full:not(:empty)]:min-h-[calc(var(--card-fs-caption)+11px)] [&_.rounded-full:not(:empty)]:!max-w-full [&_.rounded-full:not(:empty)]:!whitespace-normal [&_.rounded-full:not(:empty)]:!rounded-[11px] [&_.rounded-full:not(:empty)]:!py-[3px] [&_.rounded-full:not(:empty)]:!leading-snug",
);

/** Chips a card without a date carries in its title row's empty right half. */
const MAX_HEAD_CHIPS = 2;

/** The small grey caption a card prints over (or before) a value to name it. */
const CAPTION =
  "text-[length:var(--card-fs-caption)] leading-snug font-normal text-text-secondary";

/**
 * A table cell that stacks a code over its name reads, on a card, the way its caption does:
 * "COM_0419 / Acme Joint Stock Company …" on one line, wrapping as a sentence.
 */
// A date over its week pill keeps its two lines: only plain text pairs run on.
const CODE_NAME_INLINE =
  "[&_.flex-col:not(:has(.rounded-full))]:!block [&_.flex-col:not(:has(.rounded-full))>*]:!inline [&_.flex-col:not(:has(.rounded-full))>*+*]:before:content-['_/_']";

/** The status that tints the card's left edge, read off its rendered badge. */
const ACCENT_ATTR = "data-card-accent";

type CardRole = NonNullable<TableColumnMobile["role"]> | "actions";

interface CardSlot<T> {
  column: TableColumn<T>;
  role: CardRole;
  /** Drawn once in the card header rather than once per line. */
  record: boolean;
  label: string;
}

interface CardRow<T> {
  item: T;
  /** Position in `data`, the index the column renderers and `onRowClick` expect. */
  index: number;
}

export interface TableMobileCardSelectAll {
  checked: boolean;
  indeterminate: boolean;
  /** Rows "select all" reaches on this page. */
  count: number;
  onChange: (checked: boolean) => void;
}

export interface TableMobileCardListProps<T> {
  /** The columns the table would draw, already narrowed to the visible ones. */
  columns: Array<TableColumn<T>>;
  data: T[];
  rowKey: (item: T) => string;
  /** Consecutive rows sharing a key form one record, drawn as one card. */
  rowGroupKey?: (item: T) => string;
  selectable: boolean;
  selectedKeys: string[];
  isRowSelectable?: (item: T) => boolean;
  /** Ticks or unticks every key of a card at once. */
  onSelectKeys: (keys: string[], checked: boolean) => void;
  selectAll?: TableMobileCardSelectAll;
  onRowClick?: (item: T, index: number) => void;
  isRowDisabled?: (item: T) => boolean;
  rowClassName?: (item: T) => string | undefined;
  /** Shown when there are no rows; null when the layout around draws the empty state. */
  emptyText: string | null;
}

/**
 * Reads each column's place on the card from `column.mobile`, falling back to the default
 * reading: the first captioned column is the title, a status column the badge, a header-less
 * column the row actions, and every other column a captioned field.
 */
function resolveSlots<T>(columns: Array<TableColumn<T>>): Array<CardSlot<T>> {
  const labelled = columns.filter((column) => resolveColumnFilterLabel(column));
  const hasRole = (role: CardRole) =>
    columns.some((column) => column.mobile?.role === role);
  const defaultTitle = hasRole("title") ? undefined : labelled[0];
  const defaultBadge = hasRole("badge")
    ? undefined
    : labelled.find(
        (column) => column !== defaultTitle && /status/i.test(column.key),
      );

  return columns
    .map((column): CardSlot<T> => {
      const caption = resolveColumnFilterLabel(column);
      let role: CardRole = column.mobile?.role ?? "field";
      if (!column.mobile?.role) {
        // The row actions: a header-less column, or one keyed `actions` under an "Actions"
        // caption, which would otherwise fold away behind "show more" as a plain field.
        if (!caption || column.key === "actions") role = "actions";
        else if (column === defaultTitle) role = "title";
        else if (column === defaultBadge) role = "badge";
      }
      return {
        column,
        role,
        record:
          column.mobile?.record ?? column.groupSpan ?? column === defaultTitle,
        label: column.mobile?.label ?? caption ?? "",
      };
    })
    .filter((slot) => slot.role !== "hidden");
}

function groupRows<T>(
  data: T[],
  rowGroupKey?: (item: T) => string,
): Array<Array<CardRow<T>>> {
  const groups: Array<Array<CardRow<T>>> = [];
  data.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (
      rowGroupKey &&
      last &&
      rowGroupKey(last[0].item) === rowGroupKey(item)
    ) {
      last.push({ item, index });
    } else {
      groups.push([{ item, index }]);
    }
  });
  return groups;
}

function renderCell<T>(column: TableColumn<T>, row: CardRow<T>) {
  // Same lookup the table rows make: a column reads the field named by its key.
  const value = (row.item as Record<string, unknown>)[column.key];
  return column.render
    ? column.render(value, row.item, row.index)
    : (value as React.ReactNode);
}

/**
 * What a cell draws, as a string to compare two lines by: React's own bookkeeping (`_owner`,
 * `_store`) is left out, being both circular and irrelevant to what the reader sees.
 */
function cellSignature(node: React.ReactNode): string | null {
  try {
    return JSON.stringify(node, (key, value: unknown) =>
      key.startsWith("_") || typeof value === "function" ? undefined : value,
    );
  } catch {
    // Undescribable: treated as differing from every other line.
    return null;
  }
}

/** The text a cell shows, read off its rendered tree. */
function cellText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return cellText(node.props.children);
  }
  return "";
}

function isFromCardControl(event: React.MouseEvent<HTMLElement>): boolean {
  const control = (event.target as HTMLElement | null)?.closest?.(
    CARD_CONTROL_SELECTOR,
  );
  return Boolean(control && event.currentTarget.contains(control));
}

function CardCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: Readonly<{
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}>) {
  return (
    // A 44px target around a 20px box: a thumb, not a cursor, ticks it.
    <label className="-m-3 flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label={label}
        className="size-5 cursor-pointer accent-brand"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

/** Columns whose value is prose — a name, a note, an address, an email — rather than a short code. */
const WIDE_FIELD_KEY =
  /name|note|remark|description|address|content|spec|reason|email/i;

/** A value this short reads on one line of half the card, whatever its column. */
const SHORT_VALUE_LENGTH = 14;

/** A value this long wraps into a narrow column of a few words a line. */
const WIDE_FIELD_LENGTH = 28;

/**
 * A name or other prose field takes the card's whole width: in half of it, a material name
 * breaks every two or three words and reads as a column of fragments.
 */
function isWideField<T>(slot: CardSlot<T>, row: CardRow<T>): boolean {
  const length = cellText(renderCell(slot.column, row)).trim().length;
  // A short name ("Ecogreen") still fits half the card.
  if (WIDE_FIELD_KEY.test(slot.column.key)) return length > SHORT_VALUE_LENGTH;
  return length > WIDE_FIELD_LENGTH;
}

function FieldGrid<T>({
  slots,
  row,
}: Readonly<{ slots: Array<CardSlot<T>>; row: CardRow<T> }>) {
  if (slots.length === 0) return null;
  // The full-width fields (a product name) lead; the short ones follow, two to a row.
  const wide = new Set(slots.filter((slot) => isWideField(slot, row)));
  const ordered = [
    ...slots.filter((slot) => wide.has(slot)),
    ...slots.filter((slot) => !wide.has(slot)),
  ];
  return (
    // The same 6px gutter as the figure tiles and action buttons, so the second column starts
    // on the line the half-width tile and button below it start on.
    <dl className="m-0 grid grid-cols-2 gap-x-1.5 gap-y-2">
      {ordered.map((slot) => (
        <div
          key={slot.column.key}
          className={cn("min-w-0 pr-1.5", wide.has(slot) && "col-span-2")}
        >
          <dt className="truncate text-[length:var(--card-fs-caption)] leading-snug text-text-secondary">
            {slot.label}
          </dt>
          <dd
            className={cn(
              "m-0 mt-px min-w-0 break-words text-[length:var(--card-fs-body)] font-semibold text-text-primary",
              ALIGN_START,
              UNCLIP,
              CODE_NAME_INLINE,
            )}
          >
            {renderCell(slot.column, row)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const TILE_TONES = {
  plain: { tile: "bg-surface-tertiary", label: "text-text-secondary" },
  success: {
    tile: "bg-success-bg text-success-text",
    label: "text-success-text",
  },
  violet: { tile: "bg-purple-bg text-purple-text", label: "text-purple-text" },
} as const;

function MetricTiles<T>({
  slots,
  row,
  unit,
}: Readonly<{
  slots: Array<CardSlot<T>>;
  row: CardRow<T>;
  /** The line's unit column, printed after each figure that does not carry its own. */
  unit?: CardSlot<T>;
}>) {
  if (slots.length === 0) return null;
  const unitText = unit ? cellText(renderCell(unit.column, row)).trim() : "";
  return (
    // Halves for two or four figures, so the tiles line up with the two-column fields above;
    // thirds otherwise, and a lone figure keeps a tile's size instead of stretching across.
    <div
      className={cn(
        "grid gap-1.5",
        slots.length === 2 || slots.length === 4
          ? "grid-cols-2"
          : "grid-cols-3",
      )}
    >
      {slots.map((slot) => {
        const emphasis = slot.column.mobile?.emphasis;
        let toneKey: keyof typeof TILE_TONES = "plain";
        if (emphasis === "violet") toneKey = "violet";
        else if (emphasis) toneKey = "success";
        const tone = TILE_TONES[toneKey];
        const isNote = slot.role === "note";
        const value = renderCell(slot.column, row);
        // A zero is the figure the reader can skip: drawn grey, as the mock does.
        const isZero = !isNote && /^0([.,]0+)?$/.test(cellText(value).trim());
        // An amount in the hundreds of millions does not fit a third of a card at figure size,
        // and a figure must not break across lines, so a long one steps down a size instead.
        const isLongFigure =
          !isNote && cellText(value).replace(/\s+/g, "").length > 9;
        return (
          <div
            key={slot.column.key}
            className={cn("min-w-0 rounded-lg px-[9px] py-1.5", tone.tile)}
          >
            {/* A caption carrying its unit, "Qty in (kg / pcs)", wraps rather than clips. */}
            <div
              className={cn(
                "break-words text-[length:var(--card-fs-micro)] font-semibold uppercase leading-tight tracking-[0.03em]",
                tone.label,
              )}
            >
              {slot.label}
            </div>
            <div
              className={cn(
                "mt-0.5",
                isNote
                  ? "break-words text-[length:var(--card-fs-body)] text-text-primary [&_*]:!text-inherit"
                  : // A figure stacked over its unit in the table column reads as one line here.
                    "flex flex-wrap items-baseline text-[length:var(--card-fs-figure)] font-bold tabular-nums [&>*]:!w-auto [&>*]:flex [&>*]:flex-wrap [&>*]:items-baseline [&>*]:gap-x-1 [&_.text-\[10px\]]:!text-[length:var(--card-fs-caption)] [&_.text-\[10px\]]:!font-medium [&_.text-\[10px\]]:!text-text-secondary",
                // The table colours its figures by column; a tile is coloured by its tone alone.
                isLongFigure && "!text-[length:var(--card-fs-body)]",
                !isNote &&
                  isZero &&
                  "text-text-tertiary [&_*]:!text-text-tertiary",
                !isNote && !isZero && emphasis && "[&_*]:!text-inherit",
                !isNote &&
                  !isZero &&
                  !emphasis &&
                  "text-text-primary [&_*]:!text-text-primary",
                ALIGN_START,
                UNCLIP,
              )}
            >
              {value}
              {!isNote && unitText && unitText !== "—" ? (
                <small className="ml-1 text-[length:var(--card-fs-caption)] font-medium text-text-secondary">
                  {unitText}
                </small>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface CardTile {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Green (`true`) for the figure the reader came for, violet for what goes out. */
  emphasis?: boolean | "violet";
  /** A line under the value, e.g. an earlier version's figure. */
  hint?: React.ReactNode;
}

/**
 * Figure tiles, three to a row, styled as a card's own metric tiles — for a `block` column
 * that draws its own section (a product line of a quotation) and wants the same tiles.
 */
export function CardTiles({ tiles }: Readonly<{ tiles: CardTile[] }>) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {tiles.map((tile, index) => {
        let toneKey: keyof typeof TILE_TONES = "plain";
        if (tile.emphasis === "violet") toneKey = "violet";
        else if (tile.emphasis) toneKey = "success";
        const tone = TILE_TONES[toneKey];
        return (
          <div
            // Tiles are a fixed, ordered set drawn from one record.

            key={index}
            className={cn("min-w-0 rounded-lg px-[9px] py-1.5", tone.tile)}
          >
            <div
              className={cn(
                "break-words text-[length:var(--card-fs-micro)] font-semibold uppercase leading-tight tracking-[0.03em]",
                tone.label,
              )}
            >
              {tile.label}
            </div>
            <div
              className={cn(
                "mt-0.5 break-words text-[length:var(--card-fs-figure)] font-bold tabular-nums",
                tile.emphasis ? "" : "text-text-primary",
              )}
            >
              {tile.value}
            </div>
            {tile.hint ? (
              <div className="mt-0.5 text-[length:var(--card-fs-caption)] text-text-secondary">
                {tile.hint}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A plain-text value (a material group, say) drawn as a small grey pill under its caption. */
function TagCell<T>({
  slot,
  row,
}: Readonly<{ slot: CardSlot<T>; row: CardRow<T> }>) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[length:var(--card-fs-caption)] leading-snug text-text-secondary">
        {slot.label}
      </span>
      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-surface-tertiary px-[7px] text-[length:var(--card-fs-caption)] font-semibold leading-snug text-text-primary [&_*]:!text-inherit">
        {renderCell(slot.column, row)}
      </span>
    </div>
  );
}

/**
 * A list table as cards, for a phone, where a table wider than the screen can only be read by
 * scrolling it sideways one column at a time.
 *
 * Built from the same columns and `render` functions as the rows, so a card shows exactly what
 * the row does. A table grouped by `rowGroupKey` draws one card per record: its record columns
 * once in the header, its line columns once per line. A single tap opens the record — or the
 * line tapped — since a phone has no double-click.
 */
export function TableMobileCardList<T>({
  columns,
  data,
  rowKey,
  rowGroupKey,
  selectable,
  selectedKeys,
  isRowSelectable,
  onSelectKeys,
  selectAll,
  onRowClick,
  isRowDisabled,
  rowClassName,
  emptyText,
}: Readonly<TableMobileCardListProps<T>>) {
  const t = useTranslations("common");
  const [openFields, setOpenFields] = useState<ReadonlySet<string>>(new Set());
  const [openLines, setOpenLines] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);

  // The card's left edge takes its status badge's colour, so a list of cards can be scanned by
  // state the way the badge column of the table is.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll<HTMLElement>(`[${ACCENT_ATTR}]`)
      .forEach((holder) => {
        const badge = holder.firstElementChild;
        const card = holder.closest("li");
        if (badge && card) {
          card.style.borderLeftColor = getComputedStyle(badge).color;
        }
      });
    // A button the table already named for cards (`data-card-label` prop) keeps its own word.
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>(
        "[data-card-actions] button:not([data-card-label])",
      )
      .forEach((button) => {
        const iconClass = [
          ...(button.querySelector("svg")?.classList ?? []),
        ].find((name) => name in ICON_CARD_LABEL_KEYS);
        if (iconClass) {
          button.setAttribute(
            "data-card-label",
            t(ICON_CARD_LABEL_KEYS[iconClass]),
          );
        }
      });
    // A long label ("Adjust SO balance") goes last and takes the room the short buttons leave
    // in their last row — two thirds beside a lone "Close" — or a row of its own.
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-card-actions]")
      .forEach((actions) => {
        const buttons = [
          ...actions.querySelectorAll<HTMLButtonElement>("button"),
        ].filter(
          (button) =>
            !button.disabled && button.getAttribute("aria-disabled") !== "true",
        );
        const isWide = (button: HTMLButtonElement) =>
          (
            button.getAttribute("data-card-label") ||
            button.title ||
            button.textContent ||
            ""
          ).trim().length > WIDE_ACTION_LABEL_LENGTH;
        const wide = buttons.filter(isWide);
        const shortCount = buttons.length - wide.length;
        // Only a lone long button shares a row; two or more each take their own.
        const span =
          wide.length === 1 && shortCount % 3 === 1 && shortCount > 0
            ? "2"
            : "full";
        buttons.forEach((button) => {
          if (wide.includes(button)) {
            button.setAttribute("data-card-wide", span);
          } else button.removeAttribute("data-card-wide");
        });
      });
  });

  if (data.length === 0) {
    return emptyText ? (
      <div className="px-[11px] py-5 text-center text-sm text-text-secondary">
        {emptyText}
      </div>
    ) : null;
  }

  const slots = resolveSlots(columns);
  const pick = (roles: CardRole[], record: boolean) =>
    slots.filter((slot) => roles.includes(slot.role) && slot.record === record);
  const record = {
    titles: pick(["title"], true),
    dates: pick(["date"], true),
    badges: pick(["badge"], true),
    fields: pick(["field", "tag"], true),
    metrics: pick(["metric", "note"], true),
    actions: pick(["actions"], true),
  };
  const line = {
    titles: pick(["title"], false),
    badges: pick(["badge"], false),
    tags: pick(["tag"], false),
    fields: pick(["field", "date"], false),
    metrics: pick(["metric", "note"], false),
    unit: pick(["unit"], false)[0],
    blocks: pick(["block"], false),
    actions: pick(["actions"], false),
  };
  const accentKey = slots.find(
    (slot) => slot.role === "badge" && /status/i.test(slot.column.key),
  )?.column.key;
  // Without a record title, a card is headed by its line: the line title opens it.
  const hasRecordHead = record.titles.length > 0 || record.dates.length > 0;

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>) =>
    (key: string) =>
      setter((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
  const toggleFields = toggle(setOpenFields);
  const toggleLines = toggle(setOpenLines);

  const badge = (
    slot: CardSlot<T>,
    row: CardRow<T>,
    accent: boolean,
    stacked: false | "start" | "end" = false,
  ) => {
    const cell =
      accent && slot.column.key === accentKey ? (
        <span className="contents" {...{ [ACCENT_ATTR]: "" }}>
          {renderCell(slot.column, row)}
        </span>
      ) : (
        renderCell(slot.column, row)
      );
    // A phone has no column header over a chip, so each says what it is: "Status", "Source".
    return slot.label ? (
      <span
        key={slot.column.key}
        className={
          stacked
            ? cn(
                "flex min-w-0 flex-col gap-0.5",
                stacked === "end" ? "items-end" : "items-start",
              )
            : "inline-flex items-center gap-1"
        }
      >
        <span className={CAPTION}>{slot.label}</span>
        {cell}
      </span>
    ) : (
      <React.Fragment key={slot.column.key}>{cell}</React.Fragment>
    );
  };

  const showMoreFields = (key: string, isOpen: boolean, hidden: number) =>
    hidden > 0 || isOpen ? (
      <button
        type="button"
        className="-my-1 self-start border-0 bg-transparent px-0 py-1 text-[length:var(--card-fs-body)] font-medium text-info-text [font-family:inherit]"
        aria-expanded={isOpen}
        onClick={() => toggleFields(key)}
      >
        {isOpen ? t("showFewerFields") : t("showMoreFields", { count: hidden })}
      </button>
    ) : null;

  /** The line's caption over its code and name, which run on as one sentence. */
  const lineTitle = (row: CardRow<T>) => (
    <>
      <div className="text-[length:var(--card-fs-caption)] leading-snug text-text-secondary">
        {line.titles[0].label}
      </div>
      <div
        className={cn(
          "text-[length:var(--card-fs-body)] leading-snug text-text-primary",
          "[&_*]:!inline [&_*]:!max-w-none [&_*]:!whitespace-normal [&_*]:!text-[length:var(--card-fs-body)]",
        )}
      >
        {line.titles.map((slot, index) => (
          <span
            key={slot.column.key}
            className={cn(
              "break-words",
              index === 0
                ? "mr-1 font-semibold text-info-text underline underline-offset-2 [&_*]:!text-info-text"
                : "[&_*]:!text-text-primary",
            )}
          >
            {renderCell(slot.column, row)}
          </span>
        ))}
      </div>
    </>
  );

  /**
   * A stock list — a material, its group and one figure — reads as one row: the material on
   * the left, the figure in its tile on the right. Spread over a full card, the lone tile left
   * most of it empty.
   */
  const isCompact =
    !hasRecordHead &&
    line.titles.length > 0 &&
    line.metrics.length === 1 &&
    line.metrics[0].role === "metric" &&
    line.fields.length === 0 &&
    line.badges.length === 0 &&
    line.actions.length === 0 &&
    line.blocks.length === 0 &&
    record.fields.length === 0 &&
    record.metrics.length === 0 &&
    record.actions.length === 0;

  const renderCompact = (row: CardRow<T>, leading: React.ReactNode) => (
    <div className="flex items-center gap-3">
      {leading}
      <div className="min-w-0 flex-1">
        {lineTitle(row)}
        {line.tags.map((slot) => (
          <div
            key={slot.column.key}
            className="mt-1.5 flex flex-wrap items-center gap-1.5"
          >
            <span className="text-[length:var(--card-fs-caption)] leading-snug text-text-secondary">
              {slot.label}
            </span>
            <span className="inline-flex items-center whitespace-nowrap rounded-md bg-surface-tertiary px-[7px] text-[length:var(--card-fs-caption)] font-semibold leading-snug text-text-primary [&_*]:!text-inherit">
              {renderCell(slot.column, row)}
            </span>
          </div>
        ))}
      </div>
      <div className="w-[118px] shrink-0 md:w-[160px] [&>div]:!grid-cols-1">
        <MetricTiles slots={line.metrics} row={row} unit={line.unit} />
      </div>
    </div>
  );

  /**
   * One line's own part of the card: its material, fields, figures and actions. A one-line
   * card folds the record's fields into the line's grid, so they read as one block.
   */
  const renderLine = (
    row: CardRow<T>,
    lineKey: string,
    options: {
      inGroup: boolean;
      extraFields: Array<CardSlot<T>>;
      /** The line's own chips, beside its title: those its record does not share. */
      sideBadges?: Array<CardSlot<T>>;
      leading?: React.ReactNode;
      /** Drawn between the line's title and its fields: the record's chips on a one-line card. */
      afterTitle?: React.ReactNode;
    },
  ) => {
    const fields = [...options.extraFields, ...line.fields];
    const isOpen = openFields.has(lineKey);
    const shownFields = isOpen ? fields : fields.slice(0, VISIBLE_FIELD_COUNT);
    const sideBadges = options.sideBadges ?? [];
    const sideTags = options.inGroup ? [] : line.tags;
    const gridFields = options.inGroup
      ? shownFields
      : shownFields.filter((slot) => slot.role !== "tag");
    return (
      <>
        {line.titles.length > 0 ? (
          <div
            className={cn(
              "flex gap-2",
              options.leading ? "items-center" : "items-start",
            )}
          >
            {options.leading}
            <div className="min-w-0 flex-1">{lineTitle(row)}</div>
            {sideBadges.length > 0 || sideTags.length > 0 ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                {sideBadges.map((slot) => badge(slot, row, false))}
                {sideTags.map((slot) => (
                  <TagCell key={slot.column.key} slot={slot} row={row} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {line.titles.length > 0 ? options.afterTitle : null}
        <FieldGrid slots={gridFields} row={row} />
        {showMoreFields(lineKey, isOpen, fields.length - shownFields.length)}
        <MetricTiles slots={line.metrics} row={row} unit={line.unit} />
        {line.blocks.map((slot) => (
          <div key={slot.column.key} className="min-w-0">
            {renderCell(slot.column, row)}
          </div>
        ))}
        {line.actions.map((slot) => (
          <div
            key={slot.column.key}
            data-card-actions=""
            className={cn(ACTIONS, options.inGroup && LINE_ACTIONS)}
          >
            {renderCell(slot.column, row)}
          </div>
        ))}
      </>
    );
  };

  const groups = groupRows(data, rowGroupKey);

  return (
    <div className="flex flex-col gap-2.5 px-3 py-2" data-mobile-cards="">
      {selectable && selectAll && selectAll.count > 0 ? (
        // Inset by the card's 3px edge and 14px padding, so this box lines up with each card's.
        <div className="flex items-center gap-2 pl-[17px] pr-3 text-[length:var(--card-fs-body)] text-text-primary">
          <CardCheckbox
            checked={selectAll.checked}
            indeterminate={selectAll.indeterminate}
            label={t("selectAllOnPage", { count: selectAll.count })}
            onChange={selectAll.onChange}
          />
          <span>{t("selectAllOnPage", { count: selectAll.count })}</span>
        </div>
      ) : null}

      <ul ref={listRef} className="m-0 flex list-none flex-col gap-2.5 p-0">
        {groups.map((rows) => {
          const head = rows[0];
          const cardKey = `${rowKey(head.item) || "row"}-${head.index}`;
          const isDisabled = isRowDisabled?.(head.item) ?? false;
          const opens = Boolean(onRowClick) && !isDisabled;
          const keys = [
            ...new Set(
              rows
                .filter(({ item }) => !isRowSelectable || isRowSelectable(item))
                .map(({ item }) => rowKey(item))
                .filter(Boolean),
            ),
          ];
          const isSelected =
            keys.length > 0 && keys.every((key) => selectedKeys.includes(key));
          const single = rows.length === 1;
          const linesOpen = openLines.has(cardKey);
          const shownRows =
            single || linesOpen ? rows : rows.slice(0, VISIBLE_LINE_COUNT);
          const recordFieldsKey = `${cardKey}#record`;
          const recordOpen = openFields.has(recordFieldsKey);
          const shownRecordFields = recordOpen
            ? record.fields
            : record.fields.slice(0, VISIBLE_FIELD_COUNT);
          // Ticking works per line, as the table's rows do: a bulk delete removes the lines
          // ticked, never a whole record by accident. A one-line card ticks from its header; a
          // record of several lines ticks each line beside its title.
          const lineCheckbox = (row: CardRow<T>) => {
            const key = rowKey(row.item);
            const canTick =
              selectable &&
              Boolean(key) &&
              (!isRowSelectable || isRowSelectable(row.item));
            return canTick ? (
              <CardCheckbox
                checked={selectedKeys.includes(key)}
                disabled={isRowDisabled?.(row.item) ?? false}
                label={t("selectRow")}
                onChange={(checked) => onSelectKeys([key], checked)}
              />
            ) : null;
          };
          const checkbox = single ? lineCheckbox(head) : null;
          // A line chip every line of the record shares (all "Purchase", all "In stock") is said
          // once among the record's chips; one that differs stays on each line.
          const sharedBadges = line.badges.filter((slot) => {
            const first = cellSignature(renderCell(slot.column, head));
            return (
              first !== null &&
              rows.every(
                (row) => cellSignature(renderCell(slot.column, row)) === first,
              )
            );
          });
          const lineBadges = line.badges.filter(
            (slot) => !sharedBadges.includes(slot),
          );
          const chipSlots = [...record.badges, ...sharedBadges];
          // A card without a date leaves its title row's right half empty: one or two chips
          // move up there, each under its caption, instead of taking a row of their own.
          const chipsInHead =
            hasRecordHead &&
            record.dates.length === 0 &&
            chipSlots.length > 0 &&
            chipSlots.length <= MAX_HEAD_CHIPS;
          // Beside the tick, a chip or date keeps to one line so the row stays as low as the
          // tick and the titles sit right under it.
          const tickRow = hasRecordHead && Boolean(checkbox);
          const chips = chipSlots.map((slot) => {
            if (!chipsInHead) return badge(slot, head, true, "start");
            // Beside the title a chip stands bare ("Customer", "Screw"), like a tag on the card,
            // whether or not the card has a tick.
            return badge({ ...slot, label: "" }, head, true);
          });
          // Otherwise the chips read like the fields below them: caption over value, two to a
          // row, the same columns as the field grid.
          const chipGrid =
            chips.length > 0 && !chipsInHead ? (
              <div className={cn(CHIP_ROW, CHIP_GRID)}>{chips}</div>
            ) : null;
          const headTitles = (
            <div className="min-w-0 flex-1">
              {record.titles.map((slot, i) => (
                // Each title keeps its column's caption: a bare code, company or person
                // name does not say which one it is.
                <div key={slot.column.key} className={cn(i > 0 && "mt-1")}>
                  {slot.label ? (
                    <div className={CAPTION}>{slot.label}</div>
                  ) : null}
                  <div
                    className={cn(
                      "break-words text-[length:var(--card-fs-title)] font-bold leading-snug tracking-[0.01em] text-info-text [&_*]:!text-[length:var(--card-fs-title)] [&_*]:!text-info-text",
                      i > 0 &&
                        "text-[length:var(--card-fs-body)] font-semibold",
                      ALIGN_START,
                      CODE_NAME_INLINE,
                    )}
                  >
                    {renderCell(slot.column, head)}
                  </div>
                </div>
              ))}
            </div>
          );
          const headSide = (
            <>
              {chipsInHead ? (
                <div
                  className={cn(
                    CHIP_ROW,
                    tickRow
                      ? "min-w-0 justify-end"
                      : "shrink-0 flex-col !items-end !gap-y-1",
                  )}
                >
                  {chips}
                </div>
              ) : null}
              {record.dates.map((slot) => (
                // Date over its week pill, the two centred on each other as the table cell
                // draws them; beside the tick the caption sits to their left.
                <div
                  key={slot.column.key}
                  className={cn(
                    "shrink-0 text-center text-[length:var(--card-fs-caption)] leading-snug text-text-primary",
                    "[&_.items-start]:items-center [&_.items-end]:items-center [&_.justify-start]:justify-center [&>*]:items-center",
                    tickRow && "flex items-center gap-1.5",
                  )}
                >
                  {slot.label ? (
                    <div className={CAPTION}>{slot.label}</div>
                  ) : null}
                  {renderCell(slot.column, head)}
                </div>
              ))}
            </>
          );
          const accentLineSlot = lineBadges.find(
            (slot) => slot.column.key === accentKey,
          );

          return (
            <li
              key={cardKey}
              className={cn(
                "flex flex-col gap-2 rounded-xl border border-l-[3px] border-border-secondary border-l-violet-500 bg-surface-primary px-3.5 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.04)]",
                opens && "cursor-pointer",
                isDisabled && "cursor-not-allowed opacity-50",
                single && isSelected
                  ? "border-brand-100 bg-brand-50"
                  : rowClassName?.(head.item),
              )}
              onClick={
                opens
                  ? (event) => {
                      if (isFromCardControl(event)) return;
                      // A tap on a line opens that line; anywhere else, the record.
                      const lineEl = (event.target as HTMLElement).closest?.(
                        "[data-card-line]",
                      );
                      const index = lineEl
                        ? Number(lineEl.getAttribute("data-card-line"))
                        : head.index;
                      const target =
                        rows.find((row) => row.index === index) ?? head;
                      onRowClick?.(target.item, target.index);
                    }
                  : undefined
              }
            >
              {accentLineSlot ? (
                // A record of several lines takes its edge from its first line's status.
                <span hidden {...{ [ACCENT_ATTR]: "" }}>
                  {renderCell(accentLineSlot.column, head)}
                </span>
              ) : null}

              {hasRecordHead && checkbox ? (
                // The tick gets a row of its own, beside the date or chips, so the titles
                // under it take the card's whole width.
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    {checkbox}
                    <div className="flex min-w-0 items-center gap-3">
                      {headSide}
                    </div>
                  </div>
                  {headTitles}
                </div>
              ) : null}
              {hasRecordHead && !checkbox ? (
                <div className="flex items-start gap-2">
                  {headTitles}
                  {headSide}
                </div>
              ) : null}

              {/* A one-line card shows its line (the material) first, the chips under it. */}
              {single && line.titles.length > 0 ? null : chipGrid}
              {single ? null : (
                <div className={CHIP_ROW}>
                  <span className="inline-flex items-center whitespace-nowrap rounded-md bg-surface-tertiary px-[7px] text-[length:var(--card-fs-caption)] font-semibold leading-snug text-text-primary">
                    {t("cardLineCount", { count: rows.length })}
                  </span>
                </div>
              )}

              {single ? null : (
                <>
                  <FieldGrid slots={shownRecordFields} row={head} />
                  {showMoreFields(
                    recordFieldsKey,
                    recordOpen,
                    record.fields.length - shownRecordFields.length,
                  )}
                </>
              )}
              <MetricTiles slots={record.metrics} row={head} />

              {isCompact ? renderCompact(head, checkbox) : null}

              {(isCompact ? [] : shownRows).map((row) => {
                const lineKey = `${cardKey}#${row.index}`;
                return single ? (
                  <React.Fragment key={lineKey}>
                    {renderLine(row, lineKey, {
                      inGroup: false,
                      extraFields: record.fields,
                      leading: hasRecordHead ? undefined : checkbox,
                      afterTitle: chipGrid,
                    })}
                  </React.Fragment>
                ) : (
                  <div
                    key={lineKey}
                    data-card-line={row.index}
                    className={cn(
                      "flex flex-col gap-2 border-t border-dashed border-border-secondary pt-2",
                      selectedKeys.includes(rowKey(row.item)) &&
                        "-mx-2 rounded-lg bg-brand-50 px-2 pb-2",
                    )}
                  >
                    {renderLine(row, lineKey, {
                      inGroup: true,
                      extraFields: [],
                      sideBadges: lineBadges,
                      leading: lineCheckbox(row),
                    })}
                  </div>
                );
              })}

              {!single && rows.length > VISIBLE_LINE_COUNT ? (
                <button
                  type="button"
                  className="h-10 rounded-lg border border-dashed border-brand-100 bg-brand-50 text-[length:var(--card-fs-body)] font-semibold text-info-text [font-family:inherit]"
                  aria-expanded={linesOpen}
                  onClick={() => toggleLines(cardKey)}
                >
                  {linesOpen
                    ? t("showFewerFields")
                    : t("showMoreLines", {
                        count: rows.length - VISIBLE_LINE_COUNT,
                      })}
                </button>
              ) : null}

              {record.actions.map((slot) => (
                <div
                  key={slot.column.key}
                  data-card-actions=""
                  className={ACTIONS}
                >
                  {renderCell(slot.column, head)}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
