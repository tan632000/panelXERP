"use client";

import React, { useEffect, useRef, useState } from "react";

import {
  FilterToggleButton,
  ToolbarFiltersProvider,
  useToolbarFilters,
} from "@/kernel/core/components/ui/ListToolbarFilters";
import { cn } from "@/kernel/core/lib/cn";

/**
 * The height contract the list body relies on: the container is bounded by its parent, its
 * heading rows keep their own height, and the last child — the list body — takes the rest and
 * shrinks into its own scroller. Every level between the page and `ListQueryBody` must carry
 * it; a plain `block` wrapper in between leaves the table's scroller unbounded, so the rows
 * spill out of the card instead of scrolling inside it.
 */
const LIST_BODY_FLEX_CHAIN = cn(
  "flex min-h-0 flex-1 flex-col",
  "[&>*]:shrink-0",
  // On every screen, a phone too: the header, tabs and filters stay put and only the list scrolls,
  // with its pagination held under it.
  "[&>*:last-child]:min-h-0 [&>*:last-child]:flex-1 [&>*:last-child]:shrink",
);

interface ListPageLayoutProps {
  children: React.ReactNode;
}

/**
 * Keeps everything above the list body pinned on screen — only the table area (the last
 * child: `ListQueryBody`, or an equivalent wrapper) grows and scrolls. Tabs, toolbars and
 * filters stay `shrink-0` so a long table never pushes them off screen.
 */
export function ListPageLayout({ children }: Readonly<ListPageLayoutProps>) {
  return (
    <div
      className={cn(
        LIST_BODY_FLEX_CHAIN,
        "overflow-hidden px-5 py-4 max-lg:px-3 max-lg:py-3",
      )}
    >
      {children}
    </div>
  );
}

interface ListTabAreaProps {
  children: React.ReactNode;
  id?: string;
}

/**
 * The area a tabbed list swaps its panels in, as the last child of `ListPageLayout`. It only
 * passes the bounded height down to whichever `ListTabPanel` is active.
 */
export function ListTabArea({ children, id }: Readonly<ListTabAreaProps>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" id={id}>
      {children}
    </div>
  );
}

interface ListTabPanelProps {
  children: React.ReactNode;
  id?: string;
}

/**
 * One tab's own toolbar and list body. It repeats the layout contract inside the tab area, so
 * the table it holds scrolls exactly like the table of a list without tabs.
 */
export function ListTabPanel({ children, id }: Readonly<ListTabPanelProps>) {
  return (
    <div className={LIST_BODY_FLEX_CHAIN} id={id}>
      {children}
    </div>
  );
}

/** Toolbar actions a phone still fits on the keyword box's row. */
const MAX_ACTIONS_IN_SEARCH_ROW = 3;

interface ListToolbarProps {
  children: React.ReactNode;
}

export function ListToolbar({ children }: Readonly<ListToolbarProps>) {
  const { registry, panel, toggle } = useToolbarFilters();
  const searchInRow = useRef<HTMLDivElement>(null);
  const [hasSearch, setHasSearch] = useState(true);
  const [actionsInRow, setActionsInRow] = useState(false);

  // The keyword box draws the "Filters" button beside itself; a toolbar without one gets the
  // button at the end of its row instead.
  useEffect(() => {
    const row = searchInRow.current;
    setHasSearch(Boolean(row?.querySelector("[data-toolbar-search]")));
    // A phone draws the toolbar actions as 40px icons, so up to three of them fit beside the
    // keyword box and join its row instead of taking one of their own. Only the buttons on the
    // bar count, not the items of a menu one of them has open.
    const actions = row?.querySelector("[data-toolbar-actions]");
    const buttonCount =
      actions?.querySelectorAll(":scope > button, :scope > * > button")
        .length ?? 0;
    setActionsInRow(
      buttonCount > 0 && buttonCount <= MAX_ACTIONS_IN_SEARCH_ROW,
    );
    // Re-measured whenever the toolbar's content changes.
  }, [children]);

  return (
    <ToolbarFiltersProvider registry={registry} toggle={toggle}>
      <div
        ref={searchInRow}
        className={cn(
          "mb-3 flex flex-wrap items-center gap-2",
          // A filter group wrapping the keyword box takes the row's free width. Sized by its
          // content instead, Safari measures the box narrower than its 260px basis, so the
          // "Filters" button wraps under it and the row's actions drift off its line.
          "lg:[&>:has([data-toolbar-search])]:min-w-0 lg:[&>:has([data-toolbar-search])]:flex-1",
          // The keyword box, or the filter group wrapping it, takes the row's free width.
          actionsInRow &&
            "max-lg:[&>[data-toolbar-search]]:!min-w-0 max-lg:[&>[data-toolbar-search]]:!flex-1 max-lg:[&>[data-toolbar-search]]:!basis-0",
          actionsInRow &&
            "max-lg:[&>:has([data-toolbar-search])]:!min-w-0 max-lg:[&>:has([data-toolbar-search])]:!flex-1 max-lg:[&>:has([data-toolbar-search])]:!basis-0",
          // A `contents` wrapper lays nothing out itself: the keyword box inside it is the item.
          actionsInRow &&
            "max-lg:[&>.contents>[data-toolbar-search]]:!min-w-0 max-lg:[&>.contents>[data-toolbar-search]]:!flex-1 max-lg:[&>.contents>[data-toolbar-search]]:!basis-0",
        )}
      >
        {children}
        {toggle && !hasSearch ? <FilterToggleButton toggle={toggle} /> : null}
      </div>
      {panel}
    </ToolbarFiltersProvider>
  );
}
