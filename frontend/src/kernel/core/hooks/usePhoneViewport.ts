"use client";

import { useSyncExternalStore } from "react";

/** Below Tailwind's `lg` breakpoint (phones and tablets): the width the `max-lg:` variants style for. */
const PHONE_QUERY = "(max-width: 1023.98px)";

function phoneQuery(): MediaQueryList | null {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }
  return window.matchMedia(PHONE_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const query = phoneQuery();
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the screen is phone- or tablet-sized, for the few layouts CSS alone cannot switch — a table
 * that renders cards instead of rows, say. False on the server and wherever `matchMedia` is
 * missing (the test DOM), so those keep the desktop layout.
 */
export function usePhoneViewport(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => phoneQuery()?.matches ?? false,
    () => false,
  );
}
