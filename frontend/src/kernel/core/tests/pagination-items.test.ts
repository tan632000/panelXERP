import { describe, expect, it } from "vitest";

import { buildPaginationItems, PAGE_GAP } from "@/kernel/core/lib/pagination";

describe("buildPaginationItems", () => {
  it("lists every page while they fit in the pager", () => {
    expect(buildPaginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps a single page and drops the pager for none", () => {
    expect(buildPaginationItems(1, 1)).toEqual([1]);
    expect(buildPaginationItems(1, 0)).toEqual([]);
  });

  it("runs the first five pages before one gap near the start", () => {
    expect(buildPaginationItems(2, 50)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 50]);
    expect(buildPaginationItems(4, 50)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 50]);
  });

  it("runs the last five pages after one gap near the end", () => {
    expect(buildPaginationItems(50, 50)).toEqual([
      1,
      PAGE_GAP,
      46,
      47,
      48,
      49,
      50,
    ]);
    expect(buildPaginationItems(47, 50)).toEqual([
      1,
      PAGE_GAP,
      46,
      47,
      48,
      49,
      50,
    ]);
  });

  it("surrounds a middle page with one neighbour on each side", () => {
    expect(buildPaginationItems(25, 50)).toEqual([
      1,
      PAGE_GAP,
      24,
      25,
      26,
      PAGE_GAP,
      50,
    ]);
  });

  it("never grows past seven slots, whatever the page count", () => {
    for (const page of [1, 5, 25, 200, 999]) {
      expect(buildPaginationItems(page, 999).length).toBeLessThanOrEqual(7);
    }
  });

  it("clamps a page outside the range instead of skipping a number", () => {
    expect(buildPaginationItems(0, 50)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 50]);
    expect(buildPaginationItems(99, 50)).toEqual([
      1,
      PAGE_GAP,
      46,
      47,
      48,
      49,
      50,
    ]);
  });

  it("always keeps the first and the last page reachable", () => {
    const items = buildPaginationItems(25, 50);
    expect(items[0]).toBe(1);
    expect(items[items.length - 1]).toBe(50);
  });
});
