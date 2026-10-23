"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the answer only differs between server and client. */
const subscribe = () => () => {};

/**
 * The element an overlay portals into, or `null` while rendering on the server.
 *
 * Overlays render into the body rather than in place: one opened from inside another's form
 * would otherwise be nested in it, and its buttons would belong to the form behind it. The
 * answer is read through `useSyncExternalStore` rather than an effect, so the server render
 * and the first client render agree without a state write after mount.
 */
export function usePortalContainer(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => document.body,
    () => null,
  );
}
