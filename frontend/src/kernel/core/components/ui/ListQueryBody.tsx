"use client";

import React from "react";

import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import {
  Pagination,
  type PaginationProps,
} from "@/kernel/core/components/ui/Pagination";
import { TableEmptyRowOwnedContext } from "@/kernel/core/components/ui/table-empty-row-context";
import { LIST_STATE_MIN_HEIGHT_PX } from "@/kernel/core/constants/list-ui";
import { useFollowLastPage } from "@/kernel/core/hooks/useFollowLastPage";
import { cn } from "@/kernel/core/lib/cn";

interface ListQueryBodyProps {
  isLoading: boolean;
  isEmpty: boolean;
  /** Icon and message shown under the table header when the list comes back empty. */
  emptyState: React.ReactNode;
  pagination: PaginationProps;
  children: React.ReactNode;
}

export function ListQueryBody({
  isLoading,
  isEmpty,
  emptyState,
  pagination,
  children,
}: Readonly<ListQueryBodyProps>) {
  const { currentPage, totalPages, onPageChange } = pagination;

  useFollowLastPage({ isLoading, currentPage, totalPages, onPageChange });

  /**
   * Loading and empty results both keep the table on screen and show their state under the
   * header. Replacing the table would take away the column filters that caused the state,
   * leaving no way back to a non-empty list.
   */
  const overlay = (() => {
    if (isLoading) return <LoadingState variant="list" />;
    if (isEmpty) return emptyState;
    return null;
  })();

  return (
    // The table area is the only thing here that scrolls (x and y); the pagination row stays
    // `shrink-0` directly under the card, so it follows the last row on a short page and stays
    // put — never scrolling out of view with the rows — on a full one.
    // Phone cards run edge to edge, the page's gutter moving inside them, so the pagination bar
    // under them — or the selection bar that takes its place while rows are ticked — spans the
    // screen like an app's bottom bar.
    <div className="group/list flex min-h-0 flex-1 flex-col has-[[data-mobile-cards]]:-mx-3 has-[[data-mobile-cards]]:-mb-3">
      {/*
        Sized to its rows, not to the screen: `grow-0` on an auto flex basis makes a page of 7 rows
        a 7-row card instead of a full-height white block, while `shrink` lets a page that outgrows
        the space collapse into the table's own scroller.
      */}
      <div className="scrollbar-thin flex min-h-0 shrink grow-0 flex-col overflow-auto rounded-[9px] border border-border-secondary bg-surface-primary has-[[data-mobile-cards]]:rounded-none has-[[data-mobile-cards]]:border-0 has-[[data-mobile-cards]]:bg-transparent">
        <TableEmptyRowOwnedContext.Provider value={Boolean(overlay)}>
          {children}
        </TableEmptyRowOwnedContext.Provider>
        {/*
          Outside any horizontal scroller, so a wide table cannot push it sideways, and as
          tall as a full page of rows, so an empty list keeps the size the reader associates
          with it instead of collapsing to a strip. This outer card only scrolls itself in the
          rare case the state below the header is taller than the space available — normally
          the table's own inner scroller (sized to fill this card) handles everything.
          On a short screen the state gives up its height instead of the table header: it is a
          height, not a min-height, and scrolls itself, so the header row stays whole.
        */}
        {overlay ? (
          <div
            className="scrollbar-thin flex min-h-0 shrink flex-col overflow-auto border-t border-border-secondary [&>div]:flex [&>div]:flex-1 [&>div]:flex-col [&>div]:rounded-none [&>div]:border-0"
            style={{ height: LIST_STATE_MIN_HEIGHT_PX }}
          >
            {overlay}
          </div>
        ) : null}
      </div>
      {overlay ? null : (
        <div
          className={cn(
            "shrink-0",
            "group-has-[[data-mobile-cards]]/list:border-t group-has-[[data-mobile-cards]]/list:border-border-secondary group-has-[[data-mobile-cards]]/list:bg-surface-primary group-has-[[data-mobile-cards]]/list:px-3 group-has-[[data-mobile-cards]]/list:pb-3 group-has-[[data-mobile-cards]]/list:pt-2 group-has-[[data-mobile-cards]]/list:shadow-[0_-4px_12px_rgba(17,24,39,0.05)]",
            "group-has-[[data-mobile-cards]]/list:[&>div]:mt-0 group-has-[[data-mobile-cards]]/list:[&>div]:flex-col group-has-[[data-mobile-cards]]/list:[&>div]:items-stretch group-has-[[data-mobile-cards]]/list:[&>div]:gap-1.5 group-has-[[data-mobile-cards]]/list:[&>div>span]:text-xs",
            "group-has-[[data-mobile-cards]]/list:[&>div>div]:justify-end group-has-[[data-mobile-cards]]/list:[&_button]:h-9 group-has-[[data-mobile-cards]]/list:[&_button]:min-w-9 group-has-[[data-mobile-cards]]/list:[&_button]:justify-center group-has-[[data-mobile-cards]]/list:[&_button]:rounded-lg group-has-[[data-mobile-cards]]/list:[&_button]:px-1.5",
            // The bulk actions replace the pages while something is ticked.
            "group-has-[[data-selection-bar=bottom]]/list:hidden",
          )}
        >
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
}
