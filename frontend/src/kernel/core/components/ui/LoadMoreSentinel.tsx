"use client";

import { useEffect, useRef, useState } from "react";

import { LoadingState } from "@/kernel/core/components/ui/LoadingState";

import type { RefObject } from "react";

interface UseLoadMoreOnScrollOptions {
  /** Off while the list is closed or has no next page. */
  enabled: boolean;
  /** A page (first or next) is in flight; the sentinel then waits rather than asking again. */
  isLoading?: boolean;
  onLoadMore?: () => void;
  /** The scroller the sentinel sits in; omitted, the viewport, which already honours its clipping. */
  rootRef?: RefObject<Element | null>;
}

/**
 * Infinite scroll for a paged list: returns a callback ref for a sentinel placed after the
 * last row, and loads the next page whenever that sentinel scrolls into view. Every paged
 * picker and dropdown pages this way, so none of them needs a "load more" button.
 *
 * A callback ref rather than a ref object, so the observer follows the sentinel when a
 * filtered list unmounts and remounts it.
 */
export function useLoadMoreOnScroll<T extends Element>({
  enabled,
  isLoading = false,
  onLoadMore,
  rootRef,
}: UseLoadMoreOnScrollOptions): (node: T | null) => void {
  const [target, setTarget] = useState<T | null>(null);
  // Read through a ref so the observer always calls the latest handler without rebuilding.
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!enabled || isLoading || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current?.();
      },
      { root: rootRef?.current ?? null, threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
    // Rebuilt once a page lands, so a sentinel still in view asks for the next one too.
  }, [enabled, isLoading, target, rootRef]);

  return setTarget;
}

interface LoadMoreSentinelProps {
  hasMore: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  rootRef?: RefObject<Element | null>;
}

/** Placed after a table's rows inside its scroller: loads the next page once scrolled to. */
export function LoadMoreSentinel({
  hasMore,
  isLoading,
  isLoadingMore,
  onLoadMore,
  rootRef,
}: Readonly<LoadMoreSentinelProps>) {
  const sentinelRef = useLoadMoreOnScroll<HTMLDivElement>({
    enabled: hasMore,
    isLoading: isLoading || isLoadingMore,
    onLoadMore,
    rootRef,
  });

  if (!hasMore) return null;

  return (
    <div
      ref={sentinelRef}
      aria-hidden
      className="sticky left-0 flex min-h-2 justify-center pt-2"
    >
      {isLoadingMore ? <LoadingState /> : null}
    </div>
  );
}
