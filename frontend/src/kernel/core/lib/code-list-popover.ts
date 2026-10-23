/** One disclosed row: the code a list cell shows, and the name that identifies it. */
export interface CodeListPopoverItem {
  code: string;
  label: string | null;
}

/** Matches TableColumnFilter so the popover stacks above the list chrome. */
export const CODE_LIST_POPOVER_Z_INDEX = 600;
const CODE_LIST_POPOVER_GAP_PX = 4;
const CODE_LIST_POPOVER_HEADER_PX = 36;
const CODE_LIST_POPOVER_ROW_PX = 28;
const CODE_LIST_POPOVER_MIN_WIDTH_PX = 220;

export interface CodeListPopoverPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

/** How many codes follow the first; zero leaves the cell without a badge. */
export function resolveCodeListBadgeCount(codes: string[]): number {
  return Math.max(codes.length - 1, 0);
}

/**
 * Places the popover in viewport coordinates so a last-row hover overlays the table footer
 * instead of expanding the overflow scroller.
 */
export function resolveCodeListPopoverPosition(
  trigger: Pick<DOMRect, "top" | "bottom" | "left">,
  itemCount: number,
  viewport: Pick<DOMRect, "width" | "height">,
): CodeListPopoverPosition {
  const estimatedHeight =
    CODE_LIST_POPOVER_HEADER_PX +
    Math.max(itemCount, 1) * CODE_LIST_POPOVER_ROW_PX;
  const fitsBelow =
    trigger.bottom + CODE_LIST_POPOVER_GAP_PX + estimatedHeight <=
    viewport.height;
  const left = Math.max(
    8,
    Math.min(
      trigger.left,
      Math.max(8, viewport.width - CODE_LIST_POPOVER_MIN_WIDTH_PX - 8),
    ),
  );

  if (fitsBelow) {
    return {
      top: trigger.bottom + CODE_LIST_POPOVER_GAP_PX,
      left,
      placement: "bottom",
    };
  }

  return {
    top: trigger.top - CODE_LIST_POPOVER_GAP_PX,
    left,
    placement: "top",
  };
}
