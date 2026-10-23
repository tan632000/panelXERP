import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table } from "@/kernel/core/components/ui/Table";
import { pickerColumnWidthKey } from "@/kernel/core/lib/picker-column-width-key";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

const apiGet = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, put: apiPut },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiGet.mockReset();
  apiPut.mockReset();
});

interface Row {
  id: string;
  plain: string;
  stacked: string;
}

const data: Row[] = [{ id: "1", plain: "a value", stacked: "SUP_0001" }];

const STORED_PREFERENCE = {
  moduleKey: "rfq_list_v3",
  visibleColumns: ["plain", "stacked"],
  frozenColumn: null,
  columnWidths: { plain: 64, stacked: 150 },
};

const columns: Array<TableColumn<Row>> = [
  { key: "plain", header: "Plain" },
  {
    key: "stacked",
    header: "Stacked",
    // The supplier/company shape: a code above its name, the name a `truncate` leaf.
    render: (_, item) => (
      <div className="flex flex-col leading-tight">
        <span className="font-semibold">{item.stacked}</span>
        <span className="truncate text-text-secondary">
          A very long supplier name
        </span>
      </div>
    ),
  },
];

function renderTable(columnPreferenceKey?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider client={client}>
        <Table
          columns={columns}
          data={data}
          columnPreferenceKey={columnPreferenceKey}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** A data cell's wrapper; a list with a preference key leads with a cell-less gear column. */
function cellWrapper(container: HTMLElement, index: number): HTMLElement {
  return container.querySelectorAll<HTMLElement>(
    "tbody td > .table-cell-wrap, tbody td > .table-cell-nowrap",
  )[index];
}

function headerTitle(container: HTMLElement): HTMLElement {
  return container.querySelector("thead th span span") as HTMLElement;
}

/**
 * A list opens with every value on one line, and only breaks text across lines once the
 * reader has sized the columns. jsdom lays nothing out, so what is provable here is the
 * wrapper class each state puts on the cells, and the stylesheet rules those classes rely on.
 */
describe("Table cell wrapping", () => {
  it("keeps every cell and title on one line before any column is sized", () => {
    const { container } = renderTable();

    expect(cellWrapper(container, 0).className).toContain("table-cell-nowrap");
    // A custom render is held on one line too, whatever its own classes say.
    expect(cellWrapper(container, 1).className).toContain("table-cell-nowrap");
    expect(headerTitle(container).className).toContain("whitespace-nowrap");
  });

  it("wraps cells and titles once the columns carry the sized widths", async () => {
    apiGet.mockResolvedValue({ data: STORED_PREFERENCE });
    const { container } = renderTable("rfq_list_v3");

    await waitFor(() =>
      expect(cellWrapper(container, 0).className).toContain("table-cell-wrap"),
    );
    expect(cellWrapper(container, 1).className).toContain("table-cell-wrap");
    expect(
      cellWrapper(container, 1).querySelector(".flex.flex-col"),
    ).not.toBeNull();
    expect(headerTitle(container).className).toContain("whitespace-normal");
  });

  it("starts wrapping on the first drag", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
    } as DOMRect);
    const { container } = renderTable();
    const handle = container.querySelector(
      'th[data-col-key="plain"] [role="separator"]',
    ) as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 60 });
    fireEvent.mouseUp(window);

    expect(cellWrapper(container, 0).className).toContain("table-cell-wrap");
  });

  it("keeps the stylesheet rules both wrapper classes depend on", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf-8",
    );

    expect(css).toMatch(
      /\.table-cell-nowrap \*\s*\{[^}]*white-space:\s*nowrap/,
    );
    expect(css).toMatch(
      /\.table-cell-wrap\s+:where\(\.truncate, \.whitespace-nowrap[^{]*\{[^}]*white-space:\s*normal/,
    );
    // A render's own width cap gives way to the width the reader dragged.
    expect(css).toMatch(
      /\.table-cell-wrap :where\(\[class\*="max-w-"\]\)\s*\{[^}]*max-width:\s*100%/,
    );
    // Pills and badges stay excluded, or a badge breaks over two lines.
    expect(css).toContain(":not(.inline-flex)");
  });
});

/**
 * A width dragged on a list with a preference key belongs to the account: it is stored when
 * the drag ends and read back on the next visit, so it survives leaving the screen and
 * signing out.
 */
describe("Table column width persistence", () => {
  function stubHeaderWidths(widths: Record<string, number>) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return { width: widths[this.dataset.colKey ?? ""] ?? 0 } as DOMRect;
      },
    );
  }

  function header(container: HTMLElement, key: string): HTMLElement {
    return container.querySelector(`th[data-col-key="${key}"]`) as HTMLElement;
  }

  it("stores every column width once a drag ends", async () => {
    apiGet.mockResolvedValue({ data: null });
    apiPut.mockImplementation((_url: string, body: unknown) =>
      Promise.resolve({ data: body }),
    );
    stubHeaderWidths({ plain: 100, stacked: 150 });

    const { container } = renderTable("rfq_list_v3");
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const handle = header(container, "plain").querySelector(
      '[role="separator"]',
    ) as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 60 });
    // No write per mouse move: the layout is stored once, for the drag's end.
    expect(apiPut).not.toHaveBeenCalled();
    fireEvent.mouseUp(window);

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut).toHaveBeenCalledWith(
      "/list-preferences/rfq_list_v3",
      expect.objectContaining({
        columnWidths: { plain: 60, stacked: 150 },
      }),
    );
  });

  it("stores nothing for a click on the handle that never moved", async () => {
    apiGet.mockResolvedValue({ data: null });
    stubHeaderWidths({ plain: 100, stacked: 150 });

    const { container } = renderTable("rfq_list_v3");
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const handle = header(container, "plain").querySelector(
      '[role="separator"]',
    ) as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseUp(window);

    expect(apiPut).not.toHaveBeenCalled();
  });

  it("opens the list at the widths stored on the account", async () => {
    apiGet.mockResolvedValue({ data: STORED_PREFERENCE });

    const { container } = renderTable("rfq_list_v3");

    await waitFor(() =>
      expect(header(container, "plain").style.width).toBe("64px"),
    );
    expect(header(container, "stacked").style.width).toBe("150px");
  });
});

/**
 * A picker offers no column settings, yet a width dragged in it is kept the same way, under a
 * key derived from its columns so every screen opening that picker shares the layout.
 */
describe("Picker column widths", () => {
  it("derives a stable key from the column set", () => {
    const key = pickerColumnWidthKey(["code", "name"]);

    expect(key).toMatch(/^picker_[0-9a-z]{1,13}$/);
    expect(pickerColumnWidthKey(["code", "name"])).toBe(key);
    expect(pickerColumnWidthKey(["code", "name", "unit"])).not.toBe(key);
  });

  it("stores a dragged width without adding the column settings gear", async () => {
    apiGet.mockResolvedValue({ data: null });
    apiPut.mockImplementation((_url: string, body: unknown) =>
      Promise.resolve({ data: body }),
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
    } as DOMRect);
    const key = pickerColumnWidthKey(columns.map((column) => column.key));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <QueryClientProvider client={client}>
          <Table columns={columns} data={data} columnWidthPreferenceKey={key} />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(container.querySelectorAll("tbody tr:first-child td")).toHaveLength(
      columns.length,
    );

    const handle = container.querySelector(
      'th[data-col-key="plain"] [role="separator"]',
    ) as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 70 });
    fireEvent.mouseUp(window);

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(
        `/list-preferences/${key}`,
        expect.objectContaining({
          columnWidths: { plain: 70, stacked: 100 },
        }),
      ),
    );
  });
});
