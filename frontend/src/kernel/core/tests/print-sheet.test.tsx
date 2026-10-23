import { act, render, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PrintSheet,
  usePrintSheet,
} from "@/kernel/core/components/print/PrintSheet";
import { buildElementPrintHtml } from "@/kernel/core/lib/print/print-element";
import viCommon from "@/kernel/langs/vi/common.json";

afterEach(() => {
  document.head
    .querySelectorAll("[data-test-style]")
    .forEach((n) => n.remove());
  vi.restoreAllMocks();
});

describe("buildElementPrintHtml", () => {
  it("wraps the sheet markup in the shared shell with the app styles first", () => {
    const style = document.createElement("style");
    style.dataset.testStyle = "";
    style.textContent = ".x{color:red}";
    document.head.appendChild(style);
    const sheet = document.createElement("div");
    sheet.innerHTML = '<h1 class="x">Slip</h1>';

    const html = buildElementPrintHtml(sheet, {
      title: "Form_PR_00",
      pageSize: "A4 portrait",
    });

    expect(html).toContain("<title>Form_PR_00</title><base href=");
    expect(html.indexOf(".x{color:red}")).toBeLessThan(
      html.indexOf('font-family:"Times New Roman"'),
    );
    expect(html).toContain('<h1 class="x">Slip</h1>');
    expect(html).not.toContain("hp-doccode");
    expect(html).toContain("@page{size:A4 portrait;margin:0}");
  });
});

describe("PrintSheet + usePrintSheet", () => {
  it("prints the hidden sheet into a popup, never the app page", () => {
    const write = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: { write, close: vi.fn() },
    } as unknown as Window);
    const pagePrint = vi.spyOn(window, "print").mockImplementation(() => {});
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        {children}
      </NextIntlClientProvider>
    );
    const { result } = renderHook(
      () => usePrintSheet({ title: "Form_Lab_RO_00" }),
      { wrapper },
    );
    const { container } = render(
      <PrintSheet ref={result.current.sheetRef}>
        <p>RO slip</p>
      </PrintSheet>,
    );

    expect(container.firstElementChild?.hasAttribute("hidden")).toBe(true);
    act(() => {
      expect(result.current.print()).toBe(true);
    });
    expect(write.mock.calls[0][0]).toContain("<p>RO slip</p>");
    expect(write.mock.calls[0][0]).toContain("<title>Form_Lab_RO_00</title>");
    expect(pagePrint).not.toHaveBeenCalled();
  });
});
