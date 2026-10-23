import { useLayoutEffect, useRef } from "react";

/**
 * Keeps the selected tab of a sideways-scrolling tab row inside the visible strip.
 *
 * A tab that is a route remounts its row on every switch, so the row starts again at
 * scrollLeft 0 and a tab past the phone's width is hidden the moment it is chosen. Only the
 * row's own scrollLeft moves: `scrollIntoView` would also scroll the page vertically.
 */
export function useActiveTabInView<T extends HTMLElement>(
  activeKey: string | undefined,
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const row = ref.current;
    const tab = row?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!row || !tab) return;
    const left =
      tab.getBoundingClientRect().left -
      row.getBoundingClientRect().left +
      row.scrollLeft;
    const right = left + tab.offsetWidth;
    if (left < row.scrollLeft) {
      row.scrollLeft = left;
    } else if (right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = right - row.clientWidth;
    }
  }, [activeKey]);

  return ref;
}
