import { describe, expect, it } from "vitest";

import { scrollDeltaToReveal } from "@/kernel/core/lib/scroll-into-view";

const container = { top: 100, bottom: 400, height: 300 };

describe("scrollDeltaToReveal", () => {
  it("stays put when the item is already fully visible", () => {
    expect(
      scrollDeltaToReveal(container, { top: 150, bottom: 190, height: 40 }),
    ).toBe(0);
  });

  it("centres an item below the fold", () => {
    // Item 200px past the container top; centring leaves 130px of padding above it.
    expect(
      scrollDeltaToReveal(container, { top: 500, bottom: 540, height: 40 }),
    ).toBe(270);
  });

  it("scrolls back up for an item above the fold", () => {
    expect(
      scrollDeltaToReveal(container, { top: 20, bottom: 60, height: 40 }),
    ).toBeLessThan(0);
  });

  it("treats an item flush with the bottom edge as visible", () => {
    expect(
      scrollDeltaToReveal(container, { top: 360, bottom: 400, height: 40 }),
    ).toBe(0);
  });

  it("moves for an item clipped by a single pixel", () => {
    expect(
      scrollDeltaToReveal(container, { top: 361, bottom: 401, height: 40 }),
    ).not.toBe(0);
  });
});
