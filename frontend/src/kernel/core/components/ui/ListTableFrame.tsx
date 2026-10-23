"use client";

import React, { useContext } from "react";

import { HorizontalScrollArea } from "@/kernel/core/components/ui/HorizontalScrollArea";
import { TableEmptyRowOwnedContext } from "@/kernel/core/components/ui/table-empty-row-context";
import { cn } from "@/kernel/core/lib/cn";

interface ListTableFrameProps {
  /** Bars drawn above the scroller (filter summary, selection bar), kept out of its scroll. */
  header?: React.ReactNode;
  /** Bars drawn below the scroller, kept in view while the rows scroll above them. */
  footer?: React.ReactNode;
  className?: string;
  /** The `<table>`, plus anything that must sit next to it inside the scroller. */
  children: React.ReactNode;
}

/**
 * The card and scroller every list table sits in — the kernel `Table` and any hand-built
 * table alike — so a list scrolls the same way on every screen.
 *
 * The card is a shrinking flex column, bounded by the `ListPageLayout` → `ListQueryBody`
 * chain above it; the scroller inside takes what is left and scrolls both x and y, with the
 * table's `thead` pinned to its top. A plain block card here would let its `overflow-hidden`
 * clip the rows a page cannot fit, leaving no vertical scrollbar at all.
 *
 * `grow shrink` rather than `flex-1`: `flex-1` zeroes the flex basis, which would stop the rows
 * contributing to the card's height and stretch the card to the full screen even for a handful
 * of rows. Keeping the auto basis sizes the card to its rows, and lets it shrink into a
 * scroller only once the rows outgrow the space.
 *
 * Outside a list page nothing bounds the card, so its horizontal bar would sit under the last
 * row; `HorizontalScrollArea` then pins a proxy bar to the bottom of the view. The card clips
 * with `overflow-clip`, not `overflow-hidden`, so it does not become the proxy's sticky box.
 */
export function ListTableFrame({
  header,
  footer,
  className,
  children,
}: Readonly<ListTableFrameProps>) {
  // While `ListQueryBody` draws the empty or loading state below, the frame holds only the
  // header. Letting it shrink would squeeze the header into a few-pixel scroller under the
  // state's reserved height on a short screen.
  const isStateBelow = useContext(TableEmptyRowOwnedContext);
  return (
    <div
      className={cn(
        "flex min-h-0 shrink grow flex-col overflow-clip rounded-[9px] border border-border-secondary bg-surface-primary",
        isStateBelow && "shrink-0",
        className,
      )}
    >
      {header}
      <HorizontalScrollArea
        outerClassName="flex min-h-0 shrink grow flex-col"
        className="scrollbar-thin min-h-0 shrink grow overflow-x-auto overflow-y-auto [&>table>thead]:sticky [&>table>thead]:top-0 [&>table>thead]:z-[5]"
      >
        {children}
      </HorizontalScrollArea>
      {footer}
    </div>
  );
}
