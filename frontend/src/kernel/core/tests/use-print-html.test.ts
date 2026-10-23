import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePrintHtml } from "@/kernel/core/hooks/usePrintHtml";
import { subscribeToast } from "@/kernel/core/lib/toast";

describe("usePrintHtml", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints without toasting when the popup opens", () => {
    const write = vi.fn();
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: { write, close },
    } as unknown as Window);
    const received: Array<{ type: string; message: string }> = [];
    const unsubscribe = subscribeToast((toast) => received.push(toast));

    const { result } = renderHook(() => usePrintHtml("Popup blocked"));
    expect(result.current("<p>hi</p>")).toBe(true);

    expect(write).toHaveBeenCalledWith("<p>hi</p>");
    expect(received).toEqual([]);
    unsubscribe();
  });

  it("toasts the given message when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const received: Array<{ type: string; message: string }> = [];
    const unsubscribe = subscribeToast((toast) => received.push(toast));

    const { result } = renderHook(() => usePrintHtml("Popup blocked"));
    expect(result.current("<p>hi</p>")).toBe(false);

    expect(received).toEqual([{ type: "error", message: "Popup blocked" }]);
    unsubscribe();
  });
});
