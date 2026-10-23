"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";

export interface DateWeekCellProps {
  date: React.ReactNode;
  week?: React.ReactNode;
  /**
   * Overrides the date line's own colour — for a screen that marks a date as a problem (a
   * deadline already missed, say) while the week pill keeps its normal styling.
   */
  dateClassName?: string;
}

/**
 * Date/week list cell: the date on the first line and the week pill wrapped underneath,
 * as the mock screens render every date/week column.
 */
export function DateWeekCell({
  date,
  week,
  dateClassName,
}: Readonly<DateWeekCellProps>) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span
        className={cn(
          "whitespace-nowrap",
          dateClassName ?? "text-text-primary",
        )}
      >
        {date}
      </span>
      {week ? (
        <span className="inline-flex w-fit items-center rounded-full bg-info-bg px-[7px] py-[2px] text-[10px] font-bold whitespace-nowrap text-info-text">
          {week}
        </span>
      ) : null}
    </div>
  );
}
