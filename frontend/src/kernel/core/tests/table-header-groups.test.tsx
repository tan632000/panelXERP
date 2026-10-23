import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { buildHeaderRows } from "@/kernel/core/lib/table-header-groups";
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
  x: string;
}

const ROW: Row = { id: "1", a: "a", b: "b", c: "c", d: "d", x: "x" };

function renderTable(
  columns: Array<TableColumn<Row>>,
  extra: { fixedLeadingColumns?: number; columnPreferenceKey?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider client={client}>
        <Table<Row> columns={columns} data={[ROW]} {...extra} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** Each header row's data and group cells as `label(colSpan x rowSpan)`; gear and checkbox cells excluded. */
function headerRows(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll("thead tr")).map((tr) =>
    Array.from(
      tr.querySelectorAll<HTMLElement>(
        'th[data-col-key], th[scope="colgroup"]',
      ),
    ).map((th) => {
      const col = th.getAttribute("colspan") ?? "1";
      const row = th.getAttribute("rowspan") ?? "1";
      return `${(th.textContent ?? "").trim()}(${col}x${row})`;
    }),
  );
}

describe("buildHeaderRows", () => {
  it("never lets a group span a column outside it", () => {
    const { rows } = buildHeaderRows([
      { headerGroup: "g" },
      {},
      { headerGroup: ["g"] },
    ]);

    expect(rows[0]).toEqual([
      { type: "group", label: "g", colIndex: 0, colSpan: 1 },
      { type: "leaf", colIndex: 1, rowSpan: 2 },
      { type: "group", label: "g", colIndex: 2, colSpan: 1 },
    ]);
  });
});

describe("Table header groups", () => {
  it("draws a group over its adjacent members and spans the others down (R1.1)", () => {
    const { container } = renderTable([
      { key: "a", header: "A" },
      { key: "b", header: "B", headerGroup: "Giá" },
      { key: "c", header: "C", headerGroup: "Giá" },
      { key: "d", header: "D" },
    ]);

    expect(headerRows(container)).toEqual([
      ["A(1x2)", "Giá(2x1)", "D(1x2)"],
      ["B(1x1)", "C(1x1)"],
    ]);
  });

  it("splits a group around a column outside it", () => {
    const { container } = renderTable([
      { key: "a", header: "A", headerGroup: "g" },
      { key: "b", header: "B" },
      { key: "c", header: "C", headerGroup: "g" },
    ]);

    expect(headerRows(container)[0]).toEqual(["g(1x1)", "B(1x2)", "g(1x1)"]);
  });

  it("spans a shallower column through every remaining row (R1.2)", () => {
    const { container } = renderTable([
      { key: "x", header: "X" },
      { key: "b", header: "B", headerGroup: ["Chi phí", "Đơn vị"] },
      { key: "c", header: "C", headerGroup: ["Chi phí", "Đơn vị"] },
    ]);

    expect(headerRows(container)).toEqual([
      ["X(1x3)", "Chi phí(2x1)"],
      ["Đơn vị(2x1)"],
      ["B(1x1)", "C(1x1)"],
    ]);
  });

  it("measures pinned offsets from the leaf cells, not the first header row (R1.2)", async () => {
    const widths: Record<string, number> = { a: 120, b: 90, c: 80 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const width = widths[this.dataset.colKey ?? ""] ?? 0;
        return { width } as DOMRect;
      },
    );

    const { container } = renderTable(
      [
        { key: "a", header: "A" },
        { key: "b", header: "B", headerGroup: "G" },
        { key: "c", header: "C", headerGroup: "G" },
      ],
      { fixedLeadingColumns: 3 },
    );

    // The grouped columns' own cells sit in the second header row; reading the first row
    // instead would find only `A` and the group cell and misplace `C`.
    await waitFor(() => {
      const b = container.querySelector<HTMLElement>('th[data-col-key="b"]');
      const c = container.querySelector<HTMLElement>('th[data-col-key="c"]');
      expect(b?.style.left).toBe("120px");
      expect(c?.style.left).toBe("210px");
    });
  });

  it("renders the single header row it always did without groups (R1.3)", () => {
    const { container } = renderTable([
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ]);

    expect(container.querySelectorAll("thead tr")).toHaveLength(1);
    expect(headerRows(container)).toEqual([["A(1x1)", "B(1x1)"]]);
  });

  it("counts only the visible members of a group (R1.4)", async () => {
    apiGet.mockResolvedValue({
      data: {
        moduleKey: "grouped_v1",
        visibleColumns: ["a", "b", "c"],
        frozenColumn: null,
      },
    });

    const { container } = renderTable(
      [
        { key: "a", header: "A" },
        { key: "b", header: "B", headerGroup: "Giá" },
        { key: "x", header: "X", headerGroup: "Giá" },
        { key: "c", header: "C", headerGroup: "Giá" },
      ],
      { columnPreferenceKey: "grouped_v1" },
    );

    await waitFor(() =>
      expect(headerRows(container)[0]).toEqual(["A(1x2)", "Giá(2x1)"]),
    );
  });

  it("drops a permission-gated member from the group span (R1.4)", () => {
    const { container } = renderTable([
      { key: "b", header: "B", headerGroup: "Giá" },
      { key: "x", header: "X", headerGroup: "Giá", permission: "price:read" },
      { key: "c", header: "C", headerGroup: "Giá" },
    ]);

    expect(headerRows(container)[0]).toEqual(["Giá(2x1)"]);
  });
});
