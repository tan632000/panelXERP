import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCommittedSearch } from "@/kernel/core/hooks/useCommittedSearch";

vi.mock("@/kernel/i18n/navigation", () => ({
  usePathname: () => "/master-data/mold",
}));

describe("useCommittedSearch", () => {
  it("holds a typed keyword back until Enter", () => {
    const { result } = renderHook(() => useCommittedSearch());

    act(() => result.current.setSearchQuery("M12"));
    expect(result.current.committedSearch).toBe("");

    act(() =>
      result.current.handleSearchKeyDown({
        key: "Enter",
      } as React.KeyboardEvent<HTMLInputElement>),
    );
    expect(result.current.committedSearch).toBe("M12");
  });

  it("returns the list to its unfiltered state as soon as the box is cleared", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useCommittedSearch({ onCommit }));

    act(() => result.current.setSearchQuery("M12"));
    act(() =>
      result.current.handleSearchKeyDown({
        key: "Enter",
      } as React.KeyboardEvent<HTMLInputElement>),
    );
    onCommit.mockClear();

    act(() => result.current.setSearchQuery(""));

    expect(result.current.searchQuery).toBe("");
    expect(result.current.committedSearch).toBe("");
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
