import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import viCommon from "@/kernel/langs/vi/common.json";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, put: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  a: string;
  b: string;
  c: string;
  d: string;
}

const ROW: Row = { id: "1", a: "a", b: "b", c: "c", d: "d" };

/**
 * Widths measured off `data-col-key` cells; the `afterFirstColumn` gear (no such attribute
 * in the header) gets its own width so the test can tell a stale declared offset apart from
 * the one actually read back from the DOM.
 */
const GEAR_MEASURED_WIDTH = 44;

function resolveStubbedWidth(
  element: HTMLElement,
  widths: Record<string, number>,
): number {
  const key = element.dataset.colKey;
  if (key !== undefined) return widths[key] ?? 0;
  if (element.hasAttribute("data-settings-after-first")) {
    return GEAR_MEASURED_WIDTH;
  }
  return 0;
}

function stubMeasuredWidths(widths: Record<string, number>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const width = resolveStubbedWidth(this, widths);
      return { width } as DOMRect;
    },
  );
}

function renderWithPreferences(
  columns: Array<TableColumn<Row>>,
  extra: { fixedLeadingColumns?: number; columnPreferenceKey?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider client={client}>
        <Table<Row>
          columns={columns}
          data={[ROW]}
          settingsColumnAnchor="afterFirstColumn"
          {...extra}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** A read-only report table hosting its gear after the first column, as `InventoryCheckReportTable` does. */
function afterFirstColumnColumns(): Array<TableColumn<Row>> {
  return [
    { key: "a", header: "A" },
    { key: "b", header: "B" },
    { key: "c", header: "C" },
    { key: "d", header: "D" },
  ];
}

describe("Table sticky columns — afterFirstColumn gear", () => {
  it("pins the gear between two frozen columns, closing the gap (M5)", async () => {
    apiGet.mockResolvedValue({
      data: null,
    });
    stubMeasuredWidths({ a: 100, b: 80, c: 70, d: 60 });

    const { container } = renderWithPreferences(afterFirstColumnColumns(), {
      fixedLeadingColumns: 2,
      columnPreferenceKey: "m1",
    });

    await waitFor(() => {
      const a = container.querySelector<HTMLElement>('th[data-col-key="a"]');
      const gear = container.querySelector<HTMLElement>(
        "th[data-settings-after-first]",
      );
      const b = container.querySelector<HTMLElement>('th[data-col-key="b"]');
      expect(a?.style.left).toBe("0px");
      expect(gear?.style.left).toBe("100px");
      expect(gear?.className).toContain("sticky");
      // No gap: the gear's own left plus its measured width lands exactly on column b.
      expect(gear?.style.left).toBe("100px");
      expect(b?.style.left).toBe(`${100 + GEAR_MEASURED_WIDTH}px`);
    });

    // The body row's gear cell is pinned the same way, so no gap opens while scrolling.
    const gearCell = container.querySelector<HTMLElement>(
      "td[data-settings-after-first]",
    );
    expect(gearCell?.className).toContain("sticky");
    expect(gearCell?.style.left).toBe("100px");
  });

  it("keeps the pinned chain contiguous with three frozen columns (M5)", async () => {
    apiGet.mockResolvedValue({
      data: null,
    });
    stubMeasuredWidths({ a: 100, b: 80, c: 70, d: 60 });

    const { container } = renderWithPreferences(afterFirstColumnColumns(), {
      fixedLeadingColumns: 3,
      columnPreferenceKey: "m2",
    });

    await waitFor(() => {
      const a = container.querySelector<HTMLElement>('th[data-col-key="a"]');
      const gear = container.querySelector<HTMLElement>(
        "th[data-settings-after-first]",
      );
      const b = container.querySelector<HTMLElement>('th[data-col-key="b"]');
      const c = container.querySelector<HTMLElement>('th[data-col-key="c"]');
      expect(a?.style.left).toBe("0px");
      expect(gear?.style.left).toBe("100px");
      expect(b?.style.left).toBe(`${100 + GEAR_MEASURED_WIDTH}px`);
      // c immediately follows b with no gap for the (now off-chain) gear to reopen.
      expect(c?.style.left).toBe(`${100 + GEAR_MEASURED_WIDTH + 80}px`);
    });
  });

  it("leaves the gear unpinned with a single frozen column, matching pre-fix behaviour", async () => {
    apiGet.mockResolvedValue({
      data: null,
    });
    stubMeasuredWidths({ a: 100, b: 80, c: 70, d: 60 });

    const { container } = renderWithPreferences(afterFirstColumnColumns(), {
      fixedLeadingColumns: 1,
      columnPreferenceKey: "m3",
    });

    await waitFor(() => {
      const a = container.querySelector<HTMLElement>('th[data-col-key="a"]');
      expect(a?.style.left).toBe("0px");
    });

    const gear = container.querySelector<HTMLElement>(
      "th[data-settings-after-first]",
    );
    expect(gear?.className ?? "").not.toContain("sticky");
    expect(gear?.style.left).toBe("");
  });
});

describe("Table sticky columns — plain leading table (no regression)", () => {
  it("renders the same offsets as before, with no colgroup", async () => {
    stubMeasuredWidths({ a: 100, b: 80 });

    const columns: Array<TableColumn<Row>> = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];

    const { container } = render(
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: { noResults: "" } }}
      >
        <Table<Row> columns={columns} data={[ROW]} fixedLeadingColumns={2} />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      const a = container.querySelector<HTMLElement>('th[data-col-key="a"]');
      const b = container.querySelector<HTMLElement>('th[data-col-key="b"]');
      expect(a?.style.left).toBe("0px");
      expect(b?.style.left).toBe("100px");
    });

    expect(container.querySelector("colgroup")).toBeNull();
  });
});

describe("Table sticky columns — colgroup for grouped headers (M6)", () => {
  it("renders one <col> per rendered column and keeps widths in sync with resize", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 32,
      top: 0,
      left: 0,
      right: 120,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });

    const columns: Array<TableColumn<Row>> = [
      { key: "x", header: "X" },
      { key: "b", header: "B", headerGroup: "G", style: { width: 120 } },
      { key: "c", header: "C", headerGroup: "G", style: { width: 120 } },
    ];

    const { container } = render(
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: { noResults: "" } }}
      >
        <Table<Row> columns={columns} data={[ROW]} />
      </NextIntlClientProvider>,
    );

    const colgroup = container.querySelector("colgroup");
    expect(colgroup).not.toBeNull();
    // One <col> per leaf column; this table has no selection or gear column ahead of them.
    expect(colgroup?.querySelectorAll("col")).toHaveLength(3);

    const thB = container.querySelector(
      'th[data-col-key="b"]',
    ) as HTMLTableCellElement;
    const handleB = thB.querySelector('[role="separator"]') as HTMLElement;

    fireEvent.mouseDown(handleB, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    const cols = Array.from(
      container.querySelectorAll("colgroup col"),
    ) as HTMLElement[];
    // Column order matches the leaf order: x, b (resized), c.
    expect(cols[0].style.width).toBe("120px");
    expect(cols[1].style.width).toBe("170px");
    expect(cols[2].style.width).toBe("120px");
  });

  it("renders no colgroup for an ungrouped, unlocked table", () => {
    const columns: Array<TableColumn<Row>> = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];

    const { container } = render(
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: { noResults: "" } }}
      >
        <Table<Row> columns={columns} data={[ROW]} />
      </NextIntlClientProvider>,
    );

    expect(container.querySelector("colgroup")).toBeNull();
  });
});

describe("Table sticky columns — narrow viewport", () => {
  function stubVisibleWidth(width: number) {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
      width,
    );
  }

  it("drops the pinning when the frozen columns would cover a phone's width", async () => {
    apiGet.mockResolvedValue({ data: null });
    stubMeasuredWidths({ a: 100, b: 80, c: 70, d: 60 });
    // a + gear + b + c = 294px pinned, against a 362px phone: nothing left to scroll into.
    stubVisibleWidth(362);

    const { container } = renderWithPreferences(afterFirstColumnColumns(), {
      fixedLeadingColumns: 3,
      columnPreferenceKey: "n1",
    });

    await waitFor(() => {
      const a = container.querySelector<HTMLElement>('th[data-col-key="a"]');
      expect(a?.className).not.toContain("sticky");
    });
    const cell = container.querySelector<HTMLElement>("tbody td");
    expect(cell?.className ?? "").not.toContain("sticky");
  });

  it("keeps the pinning while the frozen columns leave room to scroll", async () => {
    apiGet.mockResolvedValue({ data: null });
    stubMeasuredWidths({ a: 100, b: 80, c: 70, d: 60 });
    stubVisibleWidth(1200);

    const { container } = renderWithPreferences(afterFirstColumnColumns(), {
      fixedLeadingColumns: 3,
      columnPreferenceKey: "n2",
    });

    await waitFor(() => {
      const c = container.querySelector<HTMLElement>('th[data-col-key="c"]');
      expect(c?.className).toContain("sticky");
      expect(c?.style.left).toBe(`${100 + GEAR_MEASURED_WIDTH + 80}px`);
    });
  });
});
