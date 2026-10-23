import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import {
  COLUMN_VALUES_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/kernel/core/constants/list-ui";
import {
  columnFilterScope,
  countActiveColumnFilters,
  isColumnFilterable,
  orderByOptions,
  resolveColumnFilterKey,
  serializeColumnFilters,
  toStoredValueSearch,
  withColumnSelection,
} from "@/kernel/core/lib/table-column-filter";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumnFilterSelections } from "@/kernel/core/types/column-filter";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet },
}));

afterEach(cleanup);

interface Row {
  id: string;
  code: string;
  classification: string;
}

const ROWS: Row[] = [
  { id: "1", code: "SP-001", classification: "sfg" },
  { id: "2", code: "SP-002", classification: "fg" },
];

const CLASSIFICATION_LABELS: Record<string, string> = {
  sfg: "Bán thành phẩm",
  fg: "Thành phẩm",
};

const COLUMNS: Array<TableColumn<Row>> = [
  {
    key: "code",
    header: "Mã",
    render: (_, item) => <span>{item.code}</span>,
  },
  {
    key: "classification",
    header: "Phân loại",
    filterLabel: (value) => CLASSIFICATION_LABELS[value] ?? value,
    render: (_, item) => <span>{item.classification}</span>,
  },
  {
    key: "moldCode",
    header: "Khuôn",
    filterable: false,
    render: () => <span>—</span>,
  },
  {
    key: "actions",
    header: "",
    render: () => <button type="button">Sửa</button>,
  },
];

const ENDPOINT = "/other-materials/column-values";

function apiResponse(values: string[], page = 1, totalPages = 1) {
  return { data: valuesPage(values, page, totalPages) };
}

function valuesPage(values: string[], page = 1, totalPages = 1) {
  return {
    data: values,
    meta: {
      page,
      limit: COLUMN_VALUES_PAGE_SIZE,
      total: values.length * totalPages,
      totalPages,
    },
  };
}

function Harness({
  data = ROWS,
  columns = COLUMNS,
  columnFilterParams,
}: {
  data?: Row[];
  columns?: Array<TableColumn<Row>>;
  columnFilterParams?: Record<string, string | undefined>;
}) {
  const [columnFilters, setColumnFilters] =
    useState<TableColumnFilterSelections>({});

  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Table
          columns={columns}
          data={data}
          columnFilterEndpoint={ENDPOINT}
          columnFilterParams={columnFilterParams}
          columnFilters={columnFilters}
          onColumnFiltersChange={setColumnFilters}
        />
        <output data-testid="sent">
          {serializeColumnFilters(columnFilters) ?? ""}
        </output>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function openColumnFilter(columnLabel: string) {
  fireEvent.click(
    screen.getByRole("button", { name: `Lọc cột ${columnLabel}` }),
  );
}

describe("column filter selections", () => {
  it("counts only the columns that hold a selection", () => {
    expect(countActiveColumnFilters({ code: ["A"], name: [] })).toBe(1);
  });

  it("drops a column once its selection is emptied", () => {
    const selections = withColumnSelection({ code: ["A"] }, "code", []);
    expect(selections).toEqual({});
  });

  it("sends one JSON parameter, and nothing while unfiltered", () => {
    expect(serializeColumnFilters({})).toBeUndefined();
    expect(serializeColumnFilters({ code: [] })).toBeUndefined();
    expect(serializeColumnFilters({ code: ["A", ""] })).toBe(
      '{"code":["A",""]}',
    );
  });

  it("leaves a column without header text, or marked unfilterable, unfiltered", () => {
    expect(isColumnFilterable(COLUMNS[0])).toBe(true);
    expect(isColumnFilterable(COLUMNS[2])).toBe(false);
    expect(isColumnFilterable(COLUMNS[3])).toBe(false);
  });

  it("filters by the API column key when it differs from the table key", () => {
    expect(resolveColumnFilterKey({ key: "material", filterKey: "code" })).toBe(
      "code",
    );
    expect(resolveColumnFilterKey({ key: "code" })).toBe("code");
  });
});

describe("the list scope a column filter sends", () => {
  it("keeps the toolbar filters, renames the keyword and drops paging, sort and selections", () => {
    expect(
      columnFilterScope({
        page: 2,
        limit: 20,
        sortBy: "code",
        sortOrder: "ASC",
        columnFilters: '{"code":["A"]}',
        search: "SKD11",
        classification: "specialSteel",
        status: undefined,
        types: ["a", "b"],
        year: 2026,
      }),
    ).toEqual({
      listSearch: "SKD11",
      classification: "specialSteel",
      types: "a,b",
      year: "2026",
    });
  });

  it("is absent for an unfiltered list", () => {
    expect(columnFilterScope({ page: 1, search: "" })).toBeUndefined();
  });
});

describe("orderByOptions", () => {
  it("orders values as the option list does, unknown values last", () => {
    const order = orderByOptions([
      { value: "rawMaterial" },
      { value: "commercialGoods" },
    ]);
    expect(["legacy", "commercialGoods", "rawMaterial"].sort(order)).toEqual([
      "rawMaterial",
      "commercialGoods",
      "legacy",
    ]);
  });
});

describe("a search typed the way a labelled cell reads", () => {
  it("rewrites a date to its stored ISO form", () => {
    expect(toStoredValueSearch("19/09/2026")).toBe("2026-09-19");
    expect(toStoredValueSearch("9/2026")).toBe("2026-09");
    expect(toStoredValueSearch("1/9")).toBe("-09-01");
  });

  it("rewrites a grouped or decimal-comma number to its stored form", () => {
    expect(toStoredValueSearch("98.000")).toBe("98000");
    expect(toStoredValueSearch("1.234.567,89")).toBe("1234567.89");
    expect(toStoredValueSearch("0,636")).toBe("0.636");
    expect(toStoredValueSearch("1.5")).toBe("1.5");
  });

  it("leaves any other text to the labels", () => {
    expect(toStoredValueSearch("Thép")).toBeNull();
    expect(toStoredValueSearch("W38/2026")).toBeNull();
  });
});

describe("Table column filters", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue(apiResponse(["SP-001", "SP-002"]));
  });

  it("adds a filter to every filterable column only", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Lọc cột Mã" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Lọc cột Phân loại" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Lọc cột Khuôn" }),
    ).not.toBeInTheDocument();
  });

  it("reads the values of the whole table from the API when opened", async () => {
    render(<Harness />);
    expect(apiGet).not.toHaveBeenCalled();

    openColumnFilter("Mã");

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(ENDPOINT, {
        params: {
          column: "code",
          search: undefined,
          page: 1,
          limit: COLUMN_VALUES_PAGE_SIZE,
        },
      }),
    );
    expect(
      await screen.findByRole("checkbox", { name: "SP-001" }),
    ).toBeVisible();
  });

  it("sends the ticked values to the list query, and clears them again", async () => {
    render(<Harness />);
    openColumnFilter("Mã");

    fireEvent.click(await screen.findByRole("checkbox", { name: "SP-001" }));
    expect(screen.getByTestId("sent")).toHaveTextContent('{"code":["SP-001"]}');
    // A filtered column is named in the summary and marked on its own header icon.
    expect(screen.getByText("Đang lọc")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Lọc cột Mã",
      }),
    ).toHaveAttribute("title", "Cột Mã: đang lọc 1 giá trị");

    fireEvent.click(screen.getByRole("button", { name: "Xoá lọc" }));
    expect(screen.getByTestId("sent")).toHaveTextContent("");
  });

  it("offers the values of the rows the other filters leave, as in Excel", async () => {
    render(<Harness columnFilterParams={{ classification: "fg" }} />);
    openColumnFilter("Mã");
    fireEvent.click(await screen.findByRole("checkbox", { name: "SP-001" }));
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    openColumnFilter("Phân loại");
    await waitFor(() =>
      expect(apiGet).toHaveBeenLastCalledWith(ENDPOINT, {
        params: expect.objectContaining({
          column: "classification",
          classification: "fg",
          columnFilters: '{"code":["SP-001"]}',
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    // The open column's own selection never narrows its own list: reopening it reuses the
    // unscoped list instead of asking for one filtered by its own ticks.
    openColumnFilter("Mã");
    expect(
      await screen.findByRole("checkbox", { name: "SP-002" }),
    ).toBeVisible();
    const codeCalls = apiGet.mock.calls.filter(
      ([, options]) => options.params.column === "code",
    );
    expect(
      codeCalls.every(([, options]) => !options.params.columnFilters),
    ).toBe(true);
  });

  it("clears every column through the bar above the table", async () => {
    render(<Harness />);
    openColumnFilter("Mã");
    fireEvent.click(await screen.findByRole("checkbox", { name: "SP-001" }));

    // The strip above the table carries the only clear-all control.
    const clearAll = screen.getAllByRole("button", {
      name: "Xoá tất cả bộ lọc (1)",
    });
    expect(clearAll).toHaveLength(1);
    fireEvent.click(clearAll[0]);

    expect(screen.getByTestId("sent")).toHaveTextContent("");
    // The summary only exists while something is filtered.
    expect(screen.queryByText("Đang lọc")).not.toBeInTheDocument();
  });

  it("keeps every header title on one line, because the table scrolls sideways", () => {
    render(<Harness />);
    const header = within(screen.getByRole("table")).getByText("Phân loại");
    expect(header.className).toContain("whitespace-nowrap");
    expect(header.closest("th")?.className).toContain("whitespace-nowrap");
  });

  it("keeps the summary out of the horizontal scroller, so a wide table cannot hide it", async () => {
    render(<Harness />);
    openColumnFilter("Mã");
    fireEvent.click(await screen.findByRole("checkbox", { name: "SP-001" }));

    const clearAll = screen.getByRole("button", {
      name: "Xoá tất cả bộ lọc (1)",
    });
    const scroller = screen.getByRole("table").parentElement;
    expect(scroller?.className).toContain("overflow-x-auto");
    expect(scroller?.contains(clearAll)).toBe(false);
  });

  it("searches the values on the server rather than in the loaded page", async () => {
    render(<Harness />);
    openColumnFilter("Mã");
    await screen.findByRole("checkbox", { name: "SP-001" });

    apiGet.mockResolvedValue(apiResponse(["SP-002"]));
    fireEvent.change(screen.getByPlaceholderText("Tìm giá trị..."), {
      target: { value: "002" },
    });

    await waitFor(() =>
      expect(apiGet).toHaveBeenLastCalledWith(ENDPOINT, {
        params: {
          column: "code",
          search: "002",
          page: 1,
          limit: COLUMN_VALUES_PAGE_SIZE,
        },
      }),
    );
  });

  it("fetches one page on open, and the next only when the list is scrolled to its end", async () => {
    apiGet.mockResolvedValue(apiResponse(["SP-001", "SP-002"], 1, 2));
    render(<Harness />);
    openColumnFilter("Mã");

    await screen.findByRole("checkbox", { name: "SP-001" });
    expect(apiGet).toHaveBeenCalledTimes(1);

    apiGet.mockResolvedValue(apiResponse(["SP-003"], 2, 2));
    expect(
      screen.queryByRole("button", { name: "Tải thêm" }),
    ).not.toBeInTheDocument();
    const list = screen
      .getByRole("checkbox", { name: "SP-001" })
      .closest(".overflow-y-auto") as HTMLElement;
    fireEvent.scroll(list);

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(apiGet).toHaveBeenLastCalledWith(ENDPOINT, {
      params: {
        column: "code",
        search: undefined,
        page: 2,
        limit: COLUMN_VALUES_PAGE_SIZE,
      },
    });
  });

  it("shows the label of a stored value, and sends the stored value", async () => {
    apiGet.mockResolvedValue(apiResponse(["fg", "sfg"]));
    render(<Harness />);
    openColumnFilter("Phân loại");

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Thành phẩm" }),
    );

    expect(screen.getByTestId("sent")).toHaveTextContent(
      '{"classification":["fg"]}',
    );
  });

  it("lists the values in the column's own order rather than the API's", async () => {
    apiGet.mockResolvedValue(apiResponse(["sfg", "fg"]));
    const ordered = COLUMNS.map((column) =>
      column.key === "classification"
        ? {
            ...column,
            filterValueOrder: orderByOptions([
              { value: "fg" },
              { value: "sfg" },
            ]),
          }
        : column,
    );
    render(<Harness columns={ordered} />);
    openColumnFilter("Phân loại");
    await screen.findByRole("checkbox", { name: "Thành phẩm" });

    const names = screen
      .getAllByRole("checkbox")
      .map(
        (box) =>
          box.getAttribute("aria-label") ?? box.closest("label")?.textContent,
      );
    expect(names.indexOf("Thành phẩm")).toBeLessThan(
      names.indexOf("Bán thành phẩm"),
    );
  });

  it("searches a labelled column on the server when the text is a number as the cell reads it", async () => {
    apiGet.mockResolvedValue(apiResponse(["fg", "sfg"]));
    render(<Harness />);
    openColumnFilter("Phân loại");
    await screen.findByRole("checkbox", { name: "Thành phẩm" });

    apiGet.mockResolvedValue(apiResponse([]));
    fireEvent.change(screen.getByPlaceholderText("Tìm giá trị..."), {
      target: { value: "98.000" },
    });

    await waitFor(() =>
      expect(apiGet).toHaveBeenLastCalledWith(ENDPOINT, {
        params: {
          column: "classification",
          search: "98000",
          page: 1,
          limit: MAX_PAGE_SIZE,
        },
      }),
    );
  });

  it("searches a labelled column by the label it shows, across every page", async () => {
    apiGet.mockImplementation((_endpoint, { params }) =>
      Promise.resolve(
        params.page === 1
          ? apiResponse(["fg"], 1, 2)
          : apiResponse(["sfg"], 2, 2),
      ),
    );
    render(<Harness />);
    openColumnFilter("Phân loại");
    await screen.findByRole("checkbox", { name: "Thành phẩm" });

    fireEvent.change(screen.getByPlaceholderText("Tìm giá trị..."), {
      target: { value: "bán thành" },
    });

    expect(
      await screen.findByRole("checkbox", { name: "Bán thành phẩm" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Thành phẩm" }),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        params: expect.objectContaining({ search: "bán thành" }),
      }),
    );
  });
});

function ListBody({
  isLoading,
  isEmpty,
  data,
}: {
  isLoading: boolean;
  isEmpty: boolean;
  data: Row[];
}) {
  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider client={new QueryClient()}>
        <ListQueryBody
          isLoading={isLoading}
          isEmpty={isEmpty}
          emptyState={<EmptyState icon="box" message="Không có kết quả" />}
          pagination={{
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
            startIndex: 0,
            endIndex: 0,
            onPageChange: () => {},
            itemLabel: "sản phẩm",
          }}
        >
          <Table
            columns={COLUMNS}
            data={data}
            columnFilterEndpoint={ENDPOINT}
            columnFilters={{ code: ["SP-001"] }}
            onColumnFiltersChange={() => {}}
          />
        </ListQueryBody>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe("a loading list", () => {
  it("keeps the header and shows the spinner under it, not instead of the table", () => {
    render(<ListBody isLoading isEmpty data={[]} />);

    expect(within(screen.getByRole("table")).getByText("Mã")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lọc cột Mã" })).toBeVisible();
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.queryByText("Không có kết quả")).not.toBeInTheDocument();
  });
});

describe("an empty filter result", () => {
  it("keeps the table header, so the filters that emptied it stay reachable", () => {
    render(<ListBody isLoading={false} isEmpty data={[]} />);

    expect(within(screen.getByRole("table")).getByText("Mã")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lọc cột Mã" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xoá tất cả bộ lọc (1)" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bỏ lọc cột Mã" })).toBeVisible();
    expect(screen.getByText("Không có kết quả")).toBeVisible();
    // The layout owns the message; the table must not repeat it in a row of its own.
    expect(
      within(screen.getByRole("table")).queryByText(
        "Không có kết quả nào phù hợp.",
      ),
    ).not.toBeInTheDocument();
  });
});
