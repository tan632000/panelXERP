import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/kernel/core/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  it("does not call onDebounced when only unrelated state rerenders", () => {
    vi.useFakeTimers();
    const onDebounced = vi.fn();

    const { rerender } = renderHook(
      ({ filter, page }: { filter: string; page: number }) => {
        useDebouncedValue(filter, { delay: 300, onDebounced });
        return page;
      },
      { initialProps: { filter: "all", page: 1 } },
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDebounced).not.toHaveBeenCalled();

    rerender({ filter: "all", page: 2 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDebounced).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("calls onDebounced only when the debounced value changes", () => {
    vi.useFakeTimers();
    const onDebounced = vi.fn();

    const { rerender, result } = renderHook(
      ({ filter }: { filter: string }) =>
        useDebouncedValue(filter, { delay: 300, onDebounced }),
      { initialProps: { filter: "all" } },
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDebounced).not.toHaveBeenCalled();
    expect(result.current).toBe("all");

    rerender({ filter: "mechanical" });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDebounced).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("mechanical");

    rerender({ filter: "mechanical" });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDebounced).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
