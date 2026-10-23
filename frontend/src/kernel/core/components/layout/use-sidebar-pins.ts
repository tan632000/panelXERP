"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import api from "@/kernel/core/api/api";

/**
 * The functions an account pinned to the top of the sidebar, stored on the server so a pin
 * follows the account to every device. They ride on the per-user list preference store under
 * their own key, as the routes of the pinned entries.
 */

const PREFERENCE_KEY = "sidebar_pins";
const ENDPOINT = `/list-preferences/${PREFERENCE_KEY}`;
const EMPTY: readonly string[] = [];

interface StoredPins {
  visibleColumns: string[];
}

export function useSidebarPins(userId: number | string | undefined) {
  const qc = useQueryClient();
  // Keyed by account, so signing in as someone else in the same tab never shows the
  // previous account's pins. The rail and the drawer read the same cache entry.
  const queryKey = useMemo(
    () => ["sidebar-pins", userId ?? null] as const,
    [userId],
  );

  const { data } = useQuery({
    queryKey,
    enabled: userId !== undefined,
    // Changes only through the toggle below, which writes the cache itself.
    staleTime: Infinity,
    queryFn: async () => {
      const { data: stored } = await api.get<StoredPins | null>(ENDPOINT);
      return stored?.visibleColumns ?? [];
    },
  });

  const store = useMutation({
    mutationFn: async (pins: readonly string[]) => {
      await api.put(ENDPOINT, { visibleColumns: pins });
    },
    // A failed save drops the optimistic pin back to what the server holds.
    onError: () => qc.invalidateQueries({ queryKey }),
  });

  const pins = data ?? EMPTY;

  const togglePin = useCallback(
    (href: string) => {
      if (userId === undefined) return;
      void (async () => {
        // A first read still in flight would land after the write and wipe the new pin, and
        // cancelling reverts the cache asynchronously, so the write waits for it to settle.
        await qc.cancelQueries({ queryKey });
        const current = qc.getQueryData<string[]>(queryKey) ?? [];
        const next = current.includes(href)
          ? current.filter((pinned) => pinned !== href)
          : [...current, href];
        // Written to the cache before the round trip, so the pin shows without waiting on it.
        qc.setQueryData(queryKey, next);
        store.mutate(next);
      })();
    },
    [qc, queryKey, store, userId],
  );

  return { pins, togglePin };
}
