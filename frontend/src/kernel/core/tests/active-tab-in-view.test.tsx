import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tabs } from "@/kernel/core/components/ui/Tabs";
import { ToneTabs } from "@/kernel/core/components/ui/ToneTabs";

// jsdom has no layout: each tab is 100px wide in a 150px-wide row.
const TAB_WIDTH = 100;
const ROW_WIDTH = 150;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index =
        this.getAttribute("role") === "tab"
          ? Array.from(this.parentElement?.children ?? []).indexOf(this)
          : 0;
      const left = this.getAttribute("role") === "tab" ? index * TAB_WIDTH : 0;
      return { left, right: left + TAB_WIDTH } as DOMRect;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(
    TAB_WIDTH,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
    ROW_WIDTH,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const keys = ["a", "b", "c", "d"];

describe("active tab stays in view on a narrow row", () => {
  it("scrolls a remounted tone tab row to the selected destination", () => {
    render(
      <ToneTabs
        variant="card"
        activeKey="d"
        items={keys.map((key) => ({ key, label: key, tone: "info" }))}
      />,
    );
    // Tab d spans 300–400, so the 150px row must scroll to 250.
    expect(screen.getByRole("tablist").scrollLeft).toBe(250);
  });

  it("scrolls the underline row to the selected movement tab", () => {
    render(
      <Tabs activeKey="c" items={keys.map((key) => ({ key, label: key }))} />,
    );
    expect(screen.getByRole("tablist").scrollLeft).toBe(150);
  });

  it("leaves the row at the start when the selected tab already shows", () => {
    render(
      <Tabs activeKey="a" items={keys.map((key) => ({ key, label: key }))} />,
    );
    expect(screen.getByRole("tablist").scrollLeft).toBe(0);
  });
});
