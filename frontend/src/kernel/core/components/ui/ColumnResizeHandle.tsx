"use client";

import type React from "react";

/**
 * The drag handle on a header cell's right edge. The `<th>` it sits in must be `relative`
 * and carry `data-col-key`, which `useColumnResize` reads to lock the layout.
 */
export function ColumnResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (event: React.MouseEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      // A click on the handle must not also sort the column it sits in.
      onClick={(event) => event.stopPropagation()}
      className="absolute -right-1 inset-y-0 z-10 w-2 cursor-col-resize select-none bg-transparent hover:bg-brand/40 active:bg-brand/60"
    />
  );
}
