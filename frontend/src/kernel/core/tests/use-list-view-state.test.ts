import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useTableColumnFilters } from "@/kernel/core/hooks/useTableColumnFilters";
import { useTableSort } from "@/kernel/core/hooks/useTableSort";
import {
  clearAllListViewState,
  resetListViewUrlTracking,
} from "@/kernel/core/lib/list-view-state";
import { recordVisitedPathname } from "@/kernel/core/lib/navigation-history";

const LIST = "/sales/order";

vi.mock("@/kernel/i18n/navigation", () => ({
  usePathname: () => LIST,
}));

/** Mimics the shell recording the page a reader moved to. */
function navigateTo(pathname: string) {
  recordVisitedPathname(pathname);
}

describe("useListViewState", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("holds a filter the way component state does", () => {
    const { result } = renderHook(() => useListViewState("status", "all"));

    act(() => result.current[1]("draft"));

    expect(result.current[0]).toBe("draft");
  });

  it("re-opens the filters when the reader returns from one of the list's records", () => {
    navigateTo(LIST);
    const list = renderHook(() => useListViewState("status", "all"));
    act(() => list.result.current[1]("draft"));
    list.unmount();

    navigateTo(`${LIST}/42`);
    const reopened = renderHook(() => useListViewState("status", "all"));

    expect(reopened.result.current[0]).toBe("draft");
  });

  it("re-opens the filters when the reader returns from another screen", () => {
    navigateTo(LIST);
    const list = renderHook(() => useListViewState("status", "all"));
    act(() => list.result.current[1]("draft"));
    list.unmount();

    navigateTo("/master-data/company");
    const reopened = renderHook(() => useListViewState("status", "all"));

    expect(reopened.result.current[0]).toBe("draft");
  });

  it("forgets every list's filters when a session begins or ends, and nothing else", () => {
    const list = renderHook(() => useListViewState("status", "all"));
    act(() => list.result.current[1]("draft"));
    list.unmount();
    window.sessionStorage.setItem("unrelated", "kept");

    clearAllListViewState();
    const reopened = renderHook(() => useListViewState("status", "all"));

    expect(reopened.result.current[0]).toBe("all");
    expect(window.sessionStorage.getItem("unrelated")).toBe("kept");
  });

  it("keeps nothing at all without a key, so a screen can opt out", () => {
    const { result } = renderHook(() => useListViewState(undefined, "all"));

    act(() => result.current[1]("draft"));

    expect(window.sessionStorage.length).toBe(0);
  });

  describe("shared through the URL", () => {
    /** Lets the queued URL edit land. */
    const flushUrl = () => act(async () => {});

    it("mirrors a changed filter into the URL", async () => {
      const { result } = renderHook(() => useListViewState("status", "all"));

      act(() => result.current[1]("draft"));
      await flushUrl();

      expect(new URLSearchParams(window.location.search).get("status")).toBe(
        "draft",
      );
    });

    it("drops a filter from the URL once it is back at its default", async () => {
      const { result } = renderHook(() => useListViewState("status", "all"));

      act(() => result.current[1]("draft"));
      await flushUrl();
      act(() => result.current[1]("all"));
      await flushUrl();

      expect(new URLSearchParams(window.location.search).has("status")).toBe(
        false,
      );
    });

    it("opens a shared link with the sender's filters, over what this tab kept", () => {
      const kept = renderHook(() => useListViewState("status", "all"));
      act(() => kept.result.current[1]("cancelled"));
      kept.unmount();
      window.history.replaceState(null, "", "?status=draft&page=3");

      const status = renderHook(() => useListViewState("status", "all"));
      const page = renderHook(() => useListViewState("page", 1));

      expect(status.result.current[0]).toBe("draft");
      expect(page.result.current[0]).toBe(3);
    });

    it("puts the filters this tab kept back into the URL, so the link is shareable", async () => {
      const kept = renderHook(() => useListViewState("status", "all"));
      act(() => kept.result.current[1]("draft"));
      kept.unmount();
      window.history.replaceState(null, "", window.location.pathname);

      renderHook(() => useListViewState("status", "all"));
      await flushUrl();

      expect(new URLSearchParams(window.location.search).get("status")).toBe(
        "draft",
      );
    });

    it("round-trips structured filters as JSON", async () => {
      const { result } = renderHook(() =>
        useListViewState<Record<string, string[]>>("columnFilters", {}),
      );
      act(() => result.current[1]({ code: ["PO-001", "PO-002"] }));
      await flushUrl();
      // Another browser: only the link travels.
      window.sessionStorage.clear();

      const reopened = renderHook(() =>
        useListViewState<Record<string, string[]>>("columnFilters", {}),
      );

      expect(reopened.result.current[0]).toEqual({
        code: ["PO-001", "PO-002"],
      });
    });

    it("ignores an unreadable value rather than breaking the list", () => {
      window.history.replaceState(null, "", "?columnFilters=%7Bbroken");

      const { result } = renderHook(() =>
        useListViewState<Record<string, string[]>>("columnFilters", {}),
      );

      expect(result.current[0]).toEqual({});
    });

    it("ignores a value of the wrong kind from a hand-edited link", () => {
      window.history.replaceState(
        null,
        "",
        `?page=${encodeURIComponent('"x"')}&columnFilters=${encodeURIComponent("[1]")}`,
      );

      const page = renderHook(() => useListViewState("page", 1));
      const filters = renderHook(() =>
        useListViewState<Record<string, string[]>>("columnFilters", {}),
      );

      expect(page.result.current[0]).toBe(1);
      expect(filters.result.current[0]).toEqual({});
    });

    it("drops a tab's filter from the URL when the reader switches tabs, and restores it on return", async () => {
      const issueTab = renderHook(() => useListViewState("issueOk.search", ""));
      act(() => issueTab.result.current[1]("1231233"));
      await flushUrl();

      issueTab.unmount();
      renderHook(() => useListViewState("stockOk.search", ""));
      await flushUrl();

      const params = new URLSearchParams(window.location.search);
      expect(params.get("issueOk.search")).toBeNull();

      const back = renderHook(() => useListViewState("issueOk.search", ""));
      await flushUrl();

      expect(back.result.current[0]).toBe("1231233");
      expect(
        new URLSearchParams(window.location.search).get("issueOk.search"),
      ).toBe("1231233");
    });

    it("keeps a shared key in the URL while another filter on screen still reads it", async () => {
      const first = renderHook(() => useListViewState("status", "all"));
      act(() => first.result.current[1]("draft"));
      await flushUrl();
      const second = renderHook(() => useListViewState("status", "all"));

      first.unmount();
      await flushUrl();

      expect(second.result.current[0]).toBe("draft");
      expect(new URLSearchParams(window.location.search).get("status")).toBe(
        "draft",
      );
    });

    it("marks the URL as a whole view while a filter is on screen", async () => {
      const list = renderHook(() => useListViewState("status", "all"));
      await flushUrl();

      expect(new URLSearchParams(window.location.search).get("lv")).toBe("1");

      list.unmount();
      await flushUrl();

      expect(new URLSearchParams(window.location.search).has("lv")).toBe(false);
    });

    it("opens a shared link at the sender's defaults, not at what this tab kept", () => {
      const kept = renderHook(() => useListViewState("status", "all"));
      act(() => kept.result.current[1]("cancelled"));
      kept.unmount();
      resetListViewUrlTracking();
      // The sender left status at its default, so only the marker and their date travel.
      window.history.replaceState(null, "", "?lv=1&dateFrom=2026-10-01");

      const status = renderHook(() => useListViewState("status", "all"));
      const dateFrom = renderHook(() => useListViewState("dateFrom", ""));

      expect(status.result.current[0]).toBe("all");
      expect(dateFrom.result.current[0]).toBe("2026-10-01");
    });

    it("still restores a tab's kept filters when the tab is switched to after arrival", async () => {
      const kept = renderHook(() => useListViewState("ng.status", "all"));
      act(() => kept.result.current[1]("cancelled"));
      kept.unmount();
      await flushUrl();
      window.history.replaceState(null, "", "?lv=1");
      resetListViewUrlTracking();

      // Arrival: the OK tab reads the URL and settles the page.
      renderHook(() => useListViewState("ok.status", "all"));
      await flushUrl();
      const ngTab = renderHook(() => useListViewState("ng.status", "all"));

      expect(ngTab.result.current[0]).toBe("cancelled");
    });

    it("never strips the next page's parameters when a list unmounts after navigation", async () => {
      window.history.replaceState(null, "", "/sales/order?line=7");
      const list = renderHook(() => useListViewState("line", ""));
      await flushUrl();
      // The router already shows the record page, which reads its own `line` parameter.
      window.history.replaceState(null, "", "/sales/order/42?line=3");

      list.unmount();
      await flushUrl();

      expect(window.location.pathname).toBe("/sales/order/42");
      expect(new URLSearchParams(window.location.search).get("line")).toBe("3");
    });

    it("rejects a column selection or sort a crafted link fills with the wrong values", () => {
      window.history.replaceState(
        null,
        "",
        `?columnFilters=${encodeURIComponent('{"code":null}')}&sort=${encodeURIComponent('{"key":"code","direction":"UP"}')}`,
      );

      const columnFilters = renderHook(() =>
        useTableColumnFilters({ persistKey: "columnFilters" }),
      );
      const sorting = renderHook(() => useTableSort({ persistKey: "sort" }));

      expect(columnFilters.result.current.activeCount).toBe(0);
      expect(sorting.result.current.params).toEqual({});
    });

    it("leaves out filters and sorts on columns the reader may not use", () => {
      const filters = JSON.stringify({ unitPrice: ["100"], code: ["PO-001"] });
      const sort = JSON.stringify({ key: "unitPrice", direction: "ASC" });
      window.history.replaceState(
        null,
        "",
        `?columnFilters=${encodeURIComponent(filters)}&sort=${encodeURIComponent(sort)}`,
      );
      const omitColumns = ["unitPrice"];

      const columnFilters = renderHook(() =>
        useTableColumnFilters({ persistKey: "columnFilters", omitColumns }),
      );
      const sorting = renderHook(() =>
        useTableSort({ persistKey: "sort", omitColumns }),
      );

      expect(JSON.parse(columnFilters.result.current.param ?? "{}")).toEqual({
        code: ["PO-001"],
      });
      expect(columnFilters.result.current.activeCount).toBe(1);
      expect(sorting.result.current.params).toEqual({});
    });
  });
});
