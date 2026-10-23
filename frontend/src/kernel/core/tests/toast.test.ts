import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePausableTimeout } from "@/kernel/core/hooks/usePausableTimeout";
import { emitToast, subscribeToast } from "@/kernel/core/lib/toast";

describe("toast", () => {
  it("should emit toast events to subscribers", () => {
    const received: Array<{ type: string; message: string }> = [];
    const unsubscribe = subscribeToast((toast) => received.push(toast));

    emitToast("success", "Saved");
    emitToast("error", "Failed");

    expect(received).toEqual([
      { type: "success", message: "Saved" },
      { type: "error", message: "Failed" },
    ]);

    unsubscribe();
  });
});

describe("usePausableTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should fire after the full duration", () => {
    const callback = vi.fn();
    renderHook(() => usePausableTimeout(callback, 3000));

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should pause remaining time on hover and resume after leave", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => usePausableTimeout(callback, 3000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.pause();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.resume();
    });
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
