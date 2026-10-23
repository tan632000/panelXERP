"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the desktop sidebar is collapsed to its rail, remembered in this browser so it
 * survives moving between modules (each module mounts its own shell).
 */

const STORAGE_KEY = "erp.sidebar.collapsed";
const listeners = new Set<() => void>();
let collapsed: boolean | null = null;

function read(): boolean {
  if (collapsed === null) {
    try {
      collapsed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      collapsed = false;
    }
  }
  return collapsed;
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, read, () => false);

  const setCollapsed = useCallback((next: boolean) => {
    collapsed = next;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Still applies for this session when storage is unavailable.
    }
    listeners.forEach((notify) => notify());
  }, []);

  return [value, setCollapsed];
}
