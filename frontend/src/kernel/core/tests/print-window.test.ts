import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openPrintWindow,
  printHtml,
  writePrintDocument,
} from "@/kernel/core/lib/print/print-window";

describe("openPrintWindow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a blank popup with the given features", () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({} as unknown as Window);

    openPrintWindow("width=480,height=640");

    expect(openSpy).toHaveBeenCalledWith("", "_blank", "width=480,height=640");
  });

  it("defaults the features when none are given", () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({} as unknown as Window);

    openPrintWindow();

    expect(openSpy).toHaveBeenCalledWith("", "_blank", "width=900,height=700");
  });

  it("returns null when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(openPrintWindow()).toBeNull();
  });
});

describe("writePrintDocument", () => {
  it("writes the html and closes the document", () => {
    const write = vi.fn();
    const close = vi.fn();
    const popup = { document: { write, close } } as unknown as Window;

    writePrintDocument(popup, "<p>hi</p>");

    expect(write).toHaveBeenCalledWith("<p>hi</p>");
    expect(close).toHaveBeenCalled();
  });
});

describe("printHtml", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the popup and writes the document, returning true", () => {
    const write = vi.fn();
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: { write, close },
    } as unknown as Window);

    expect(printHtml("<p>hi</p>")).toBe(true);
    expect(write).toHaveBeenCalledWith("<p>hi</p>");
    expect(close).toHaveBeenCalled();
  });

  it("returns false without writing anything when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(printHtml("<p>hi</p>")).toBe(false);
  });
});
