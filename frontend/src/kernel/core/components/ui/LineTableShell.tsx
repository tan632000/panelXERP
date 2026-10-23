"use client";

import React, { useRef } from "react";

import { HorizontalScrollArea } from "@/kernel/core/components/ui/HorizontalScrollArea";
import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  LINE_HEADER_CELL_CENTER_CLASS,
  LINE_HEADER_CELL_CLASS,
  LINE_TABLE_SCROLL_CLASS,
} from "@/kernel/core/components/ui/line-table-styles";
import { cn } from "@/kernel/core/lib/cn";

/** A column header: its label alone, or the label with the alignment of the values under it. */
export type LineTableHeader =
  string | { label: string; align?: "left" | "center" | "right" };

const HEADER_CELL_CLASS_BY_ALIGN = {
  left: LINE_HEADER_CELL_CLASS,
  center: LINE_HEADER_CELL_CENTER_CLASS,
  right: LINE_HEADER_CELL_CLASS,
} as const;

export interface LineTableShellProps {
  /** A node, not just text, so a table whose lines are required can carry the marker. */
  title: React.ReactNode;
  /** One per column; a numeric column passes `align: "right"` so its label sits over its digits. */
  headers: LineTableHeader[];
  /** Omitted when the table has a fixed line count and cannot grow. */
  addLabel?: string;
  /** Omitted together with `addLabel`. */
  onAdd?: () => void;
  /**
   * Hides the trailing remove-button column.
   *
   * For a table whose rows are the snapshot of another record — maintenance minutes lines
   * are exactly the registration jobs — where removing a row would silently drop work the
   * actor is meant to report on.
   */
  hideRemoveColumn?: boolean;
  className?: string;
  /** Validation message for the lines as a whole (e.g. "at least one line required"). */
  error?: string;
  children: React.ReactNode;
}

/**
 * Generic BOM-style dynamic line table shell of a create/edit modal: a titled table with one
 * editable row per line and the add-line button under the rows.
 *
 * Lives in the kernel because it carries no domain — the packaging modals, the work-order
 * Master modal and anything else with a dynamic line table draw the same shell.
 */
export function LineTableShell({
  title,
  headers,
  addLabel,
  onAdd,
  hideRemoveColumn,
  className,
  error,
  children,
}: Readonly<LineTableShellProps>) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="text-sm font-semibold text-brand">{title}</div>
      <HorizontalScrollArea className={LINE_TABLE_SCROLL_CLASS}>
        <table className="w-full min-w-[500px] border-separate border-spacing-0">
          <thead>
            <tr>
              {headers.map((header, index) => {
                const { label, align = "left" } =
                  typeof header === "string" ? { label: header } : header;
                return (
                  <th
                    key={`${label}-${index}`}
                    scope="col"
                    className={HEADER_CELL_CLASS_BY_ALIGN[align]}
                  >
                    {label}
                  </th>
                );
              })}
              {/* The remove-button column. */}
              {hideRemoveColumn ? null : (
                <th scope="col" className={LINE_HEADER_CELL_CENTER_CLASS} />
              )}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </HorizontalScrollArea>
      {addLabel && onAdd ? (
        <LineAddButton label={addLabel} onClick={onAdd} />
      ) : null}
      {error ? (
        <span className="mt-0.5 text-xs text-danger-text">{error}</span>
      ) : null}
    </div>
  );
}

export interface LineAddButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** How far up from the button to look for the table it adds to. */
const LINE_TABLE_SEARCH_DEPTH = 4;

/**
 * Brings the line just added into view: the table scrolls inside its own bounded box (see
 * `HorizontalScrollArea`), so the new last row would otherwise land below its visible part.
 */
function revealAddedLine(button: HTMLButtonElement) {
  let container = button.parentElement;
  for (let depth = 0; container && depth < LINE_TABLE_SEARCH_DEPTH; depth++) {
    const scroller = Array.from(
      container.querySelectorAll<HTMLElement>("[data-scroll-area]"),
    )
      .filter(
        (candidate) =>
          candidate.compareDocumentPosition(button) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      )
      .at(-1);
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      break;
    }
    container = container.parentElement;
  }
  button.scrollIntoView?.({ block: "nearest" });
}

/**
 * The add-line button of a dynamic line table: a full-width dashed strip directly under the
 * rows, so a new line appears right where the reader clicked. Every line table places it
 * there, never in the title row.
 */
export function LineAddButton({
  label,
  onClick,
  disabled,
}: Readonly<LineAddButtonProps>) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    onClick();
    // After the new row has rendered.
    requestAnimationFrame(() => {
      if (buttonRef.current) revealAddedLine(buttonRef.current);
    });
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-secondary bg-surface-primary py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50 [font-family:inherit]"
    >
      <Icon name="plus" size={16} />
      {label}
    </button>
  );
}

export interface RemoveLineButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}

/** Trailing trash-icon button of a dynamic line row, shared by every line table. */
export function RemoveLineButton({
  onClick,
  disabled,
  label,
}: Readonly<RemoveLineButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-md border border-border-secondary text-danger-text transition-colors hover:border-danger-text hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name="trash" size={15} />
    </button>
  );
}
