"use client";

import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ModalScopeContext } from "@/kernel/core/components/ui/modal-scope-context";
import { cn } from "@/kernel/core/lib/cn";

/**
 * Inside a modal the scroller is bounded and scrolls both axes itself, with the header row
 * pinned to its top (and no leading column pinned): the horizontal bar stays under the
 * visible rows, and the table does not borrow the modal body's scroll.
 */
const MODAL_SCROLLER_CLASS = [
  "max-h-[60vh] overflow-y-auto",
  "[&>table>thead]:sticky [&>table>thead]:top-0 [&>table>thead]:z-[5]",
  // Grid line editors: the header row is the first row of the `inline-block` track.
  "[&>.inline-block>div:first-child]:sticky [&>.inline-block>div:first-child]:top-0 [&>.inline-block>div:first-child]:z-[5] [&>.inline-block>div:first-child]:bg-surface-primary",
].join(" ");

interface HorizontalScrollAreaProps {
  /** Classes of the scroller itself — the element that carries `overflow-x-auto`. */
  className?: string;
  /** Classes of the wrapper around the scroller, for a scroller that is a flex item. */
  outerClassName?: string;
  children: React.ReactNode;
}

interface BarMetrics {
  left: number;
  width: number;
  scrollWidth: number;
}

/**
 * A sideways scroller whose horizontal scrollbar stays reachable: while the bottom edge of the
 * scroller — where the native bar lives — is out of view, a proxy bar sticks to the bottom of
 * the enclosing scroll container (the page or the modal body) and scrolls the content in step.
 * Without it a long table only offers its horizontal bar after scrolling past every row.
 *
 * The proxy is mounted only while needed, so a short table — or one bounded by its own
 * vertical scroller, like a list page or any table inside a modal — keeps just its native bar.
 */
export function HorizontalScrollArea({
  className,
  outerClassName,
  children,
}: Readonly<HorizontalScrollAreaProps>) {
  const isInModal = useContext(ModalScopeContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<BarMetrics | null>(null);
  const [isEdgeVisible, setIsEdgeVisible] = useState(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const overflows = scroller.scrollWidth > scroller.clientWidth + 1;
      setMetrics((previous) => {
        if (!overflows) return null;
        const next = {
          left: scroller.offsetLeft + scroller.clientLeft,
          width: scroller.clientWidth,
          scrollWidth: scroller.scrollWidth,
        };
        return previous?.left === next.left &&
          previous.width === next.width &&
          previous.scrollWidth === next.scrollWidth
          ? previous
          : next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    // The first child can be swapped (loading -> table); keep observing the current one.
    let observed: Element | null = null;
    const observeFirstChild = () => {
      if (observed === scroller.firstElementChild) return;
      if (observed) observer.unobserve(observed);
      observed = scroller.firstElementChild;
      if (observed) observer.observe(observed);
      measure();
    };
    observeFirstChild();
    const mutations =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(observeFirstChild);
    mutations?.observe(scroller, { childList: true });
    return () => {
      observer.disconnect();
      mutations?.disconnect();
    };
  }, []);

  useEffect(() => {
    const edge = edgeRef.current;
    if (!edge || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setIsEdgeVisible(entry.isIntersecting);
    });
    observer.observe(edge);
    return () => observer.disconnect();
  }, []);

  // A modal table is bounded by its own box, whose native bar is the one to use; a proxy
  // floating over the modal's rows would only hide them.
  const showBar = !isInModal && metrics !== null && !isEdgeVisible;

  // A freshly mounted proxy starts at 0; bring it to where the content already is.
  useLayoutEffect(() => {
    if (showBar && barRef.current && scrollRef.current) {
      barRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }, [showBar]);

  const follow = (
    source: React.RefObject<HTMLDivElement | null>,
    target: React.RefObject<HTMLDivElement | null>,
  ) => {
    if (!source.current || !target.current) return;
    if (target.current.scrollLeft !== source.current.scrollLeft) {
      target.current.scrollLeft = source.current.scrollLeft;
    }
  };

  return (
    <div className={cn("relative min-w-0", outerClassName)}>
      <div
        ref={scrollRef}
        data-scroll-area
        className={cn(
          // The containing block of everything absolutely positioned inside, so the scroller
          // clips it: otherwise an `sr-only` label at the far end of a wide row resolves to
          // the wrapper below, escapes the clip and widens the modal body or the page.
          "relative",
          className,
          // A scroller that already sets its own height keeps it.
          isInModal && !className?.includes("max-h-") && MODAL_SCROLLER_CLASS,
        )}
        onScroll={() => follow(scrollRef, barRef)}
      >
        {children}
      </div>
      {/* Overlaps the scroller's last pixel row, where its native bar is drawn. */}
      <div
        ref={edgeRef}
        aria-hidden
        className="pointer-events-none -mt-px h-px shrink-0"
      />
      {showBar ? (
        <div
          ref={barRef}
          aria-hidden
          data-testid="sticky-horizontal-scrollbar"
          className="scrollbar-thin sticky bottom-0 z-[6] shrink-0 overflow-x-auto overflow-y-hidden bg-surface-primary"
          style={{ marginLeft: metrics.left, width: metrics.width }}
          onScroll={() => follow(barRef, scrollRef)}
        >
          <div style={{ width: metrics.scrollWidth, height: 1 }} />
        </div>
      ) : null}
    </div>
  );
}
