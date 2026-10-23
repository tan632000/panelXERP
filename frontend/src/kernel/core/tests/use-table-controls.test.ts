import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTableControls } from "@/kernel/core/hooks/useTableControls";

// Both halves keep their state per list path, which they read from the localized router —
// stubbed here so the hook can be exercised outside the app shell.
vi.mock("@/kernel/i18n/navigation", () => ({
  usePathname: () => "/production/work-order",
}));

describe("useTableControls", () => {
  it("sends the filter and the sort as one set of query parameters", () => {
    const { result } = renderHook(() => useTableControls());

    expect(result.current.params).toEqual({ columnFilters: undefined });

    act(() => {
      result.current.tableProps.onSortChange({ key: "code", direction: "ASC" });
    });
    act(() => {
      result.current.tableProps.onColumnFiltersChange({ status: ["open"] });
    });

    expect(result.current.params).toEqual({
      columnFilters: expect.any(String),
      sortBy: "code",
      sortOrder: "ASC",
    });
  });

  it("keeps one object identity while nothing changes, so a list query is not rebuilt", () => {
    const { result, rerender } = renderHook(() => useTableControls());
    const first = result.current.params;
    rerender();

    expect(result.current.params).toBe(first);
  });

  it("resets the list to its first page on a filter and on a sort alike", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTableControls({ onChange }));

    act(() => {
      result.current.tableProps.onSortChange({ key: "code", direction: "ASC" });
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.tableProps.onColumnFiltersChange({ status: ["open"] });
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("gives the filter and the sort their own persisted state", () => {
    // One base key, two suffixes: a screen cannot hand both halves the same name and have
    // them overwrite each other, which is what happened while each was wired by hand.
    const { result: a } = renderHook(() =>
      useTableControls({ persistKey: "master" }),
    );
    act(() => {
      a.current.tableProps.onSortChange({ key: "code", direction: "DESC" });
    });

    const { result: b } = renderHook(() =>
      useTableControls({ persistKey: "master" }),
    );

    expect(b.current.sort.sort).toEqual({ key: "code", direction: "DESC" });
    expect(b.current.columnFilters.tableProps.columnFilters).toEqual({});
  });

  it("carries both halves' table props through one spread", () => {
    const { result } = renderHook(() => useTableControls());

    expect(Object.keys(result.current.tableProps).sort()).toEqual([
      "columnFilters",
      "onColumnFiltersChange",
      "onSortChange",
      "sort",
    ]);
  });
});
