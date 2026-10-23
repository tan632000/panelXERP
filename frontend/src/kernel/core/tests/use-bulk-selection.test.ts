import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useBulkSelection } from "@/kernel/core/hooks/useBulkSelection";

describe("useBulkSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useBulkSelection());

    expect(result.current.selectedKeys).toEqual([]);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it("reports the ticked rows as keys and as ids", () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.tableProps.onSelectionChange(["3", "7"]));

    expect(result.current.selectedKeys).toEqual(["3", "7"]);
    expect(result.current.selectedIds).toEqual([3, 7]);
    expect(result.current.count).toBe(2);
  });

  it("drops a row key that is not an id", () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.tableProps.onSelectionChange(["3", "M_0001"]));

    expect(result.current.selectedIds).toEqual([3]);
  });

  it("keeps the selection while the list pages on, so a batch can span pages", () => {
    const { result, rerender } = renderHook(() => useBulkSelection());

    act(() => result.current.tableProps.onSelectionChange(["3", "7"]));
    rerender();

    // Page 2 adds to the same basket rather than replacing it.
    act(() =>
      result.current.tableProps.onSelectionChange([
        ...result.current.selectedKeys,
        "12",
      ]),
    );

    expect(result.current.selectedIds).toEqual([3, 7, 12]);
    expect(result.current.count).toBe(3);
  });

  it("unticks only the rows a batch deleted", () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.tableProps.onSelectionChange(["3", "7", "9"]));
    act(() => result.current.deselect([3, 9]));

    expect(result.current.selectedKeys).toEqual(["7"]);
  });

  it("clears every ticked row on demand", () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.tableProps.onSelectionChange(["3", "7"]));
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
  });
});
