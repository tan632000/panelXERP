/** The part of a rect this helper needs, so a caller can pass a DOMRect directly. */
export interface ScrollBox {
  top: number;
  bottom: number;
  height: number;
}

/**
 * How far a scroll container must move to reveal an item, centring it.
 *
 * Returns 0 when the item is already fully visible, so a caller can apply the delta
 * unconditionally without fighting the user's current scroll position.
 */
export function scrollDeltaToReveal(
  container: ScrollBox,
  item: ScrollBox,
): number {
  const isAbove = item.top < container.top;
  const isBelow = item.bottom > container.bottom;
  if (!isAbove && !isBelow) return 0;

  return item.top - container.top - (container.height - item.height) / 2;
}
