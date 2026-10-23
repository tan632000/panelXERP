import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import {
  isColumnSortable,
  nextSortState,
  resolveColumnSortKey,
  serializeSort,
} from "@/kernel/core/lib/table-sort";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableSortState } from "@/kernel/core/types/table-sort";

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

const COLUMNS: Array<TableColumn<Row>> = [
  { key: "code", header: "Mã", render: (_, item) => <span>{item.code}</span> },
  {
    key: "productName",
    header: "Tên",
    filterKey: "name",
    render: () => <span>—</span>,
  },
  {
    key: "computed",
    header: "Tính toán",
    sortable: false,
    render: () => <span>—</span>,
  },
  {
    key: "actions",
    header: "",
    render: () => <button type="button">Sửa</button>,
  },
];

function Harness() {
  const [sort, setSort] = useState<TableSortState | undefined>(undefined);

  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <Table columns={COLUMNS} data={ROWS} sort={sort} onSortChange={setSort} />
      <output data-testid="sent">{JSON.stringify(serializeSort(sort))}</output>
    </NextIntlClientProvider>
  );
}

const sortControl = (column: string) =>
  screen.getByRole("button", {
    name: new RegExp(`(Sắp xếp )?[Cc]ột ${column}`),
  });

describe("nextSortState", () => {
  it("sorts a fresh column ascending", () => {
    expect(nextSortState(undefined, "code")).toEqual({
      key: "code",
      direction: "ASC",
    });
  });

  it("turns ascending into descending on the same column", () => {
    expect(nextSortState({ key: "code", direction: "ASC" }, "code")).toEqual({
      key: "code",
      direction: "DESC",
    });
  });

  it("drops the sort on the third click, back to the list's own order", () => {
    expect(
      nextSortState({ key: "code", direction: "DESC" }, "code"),
    ).toBeUndefined();
  });

  it("starts over at ascending when another column is picked", () => {
    expect(nextSortState({ key: "code", direction: "DESC" }, "name")).toEqual({
      key: "name",
      direction: "ASC",
    });
  });
});

describe("serializeSort", () => {
  it("sends nothing while the list is unsorted, keeping its cache key", () => {
    expect(serializeSort(undefined)).toEqual({});
  });

  it("sends the column and direction the API takes", () => {
    expect(serializeSort({ key: "code", direction: "DESC" })).toEqual({
      sortBy: "code",
      sortOrder: "DESC",
    });
  });
});

describe("resolveColumnSortKey", () => {
  it("prefers the explicit sort key", () => {
    expect(
      resolveColumnSortKey({ key: "a", filterKey: "b", sortKey: "c" }),
    ).toBe("c");
  });

  it("falls back to the filter key, which the API sorts by too", () => {
    expect(
      resolveColumnSortKey({ key: "productName", filterKey: "name" }),
    ).toBe("name");
  });

  it("falls back to the column key", () => {
    expect(resolveColumnSortKey({ key: "code" })).toBe("code");
  });
});

describe("isColumnSortable", () => {
  it("skips a column with no header text, such as the actions column", () => {
    expect(isColumnSortable({ key: "actions", header: "" })).toBe(false);
  });

  it("honours an explicit opt-out", () => {
    expect(
      isColumnSortable({ key: "computed", header: "X", sortable: false }),
    ).toBe(false);
  });

  it("sorts a column carrying header text by default", () => {
    expect(isColumnSortable({ key: "code", header: "Mã" })).toBe(true);
  });

  it("does not sort a column the list cannot filter", () => {
    // The backend builds the sortable set out of the filter map, so an arrow here would
    // send a column the API does not know and leave the list in its default order.
    expect(
      isColumnSortable({
        key: "progress",
        header: "Tiến độ",
        filterable: false,
      }),
    ).toBe(false);
  });

  it("sorts a filterable column whose header is a node rather than plain text", () => {
    // The numeric columns right-align their header through an element; they still filter,
    // and the quantity and amount columns are the ones a reader most wants ordered.
    expect(
      isColumnSortable({
        key: "quantity",
        header: <span>Số lượng</span>,
        filterable: true,
      }),
    ).toBe(true);
  });

  it("lets a column opt in to sorting without being filterable", () => {
    expect(
      isColumnSortable({
        key: "date",
        header: "Ngày",
        filterable: false,
        sortable: true,
      }),
    ).toBe(true);
  });
});

describe("the sort control in the table header", () => {
  it("cycles one column ascending, descending, then off", () => {
    render(<Harness />);
    const sent = screen.getByTestId("sent");

    expect(sent.textContent).toBe("{}");

    fireEvent.click(sortControl("Mã"));
    expect(sent.textContent).toBe('{"sortBy":"code","sortOrder":"ASC"}');

    fireEvent.click(sortControl("Mã"));
    expect(sent.textContent).toBe('{"sortBy":"code","sortOrder":"DESC"}');

    fireEvent.click(sortControl("Mã"));
    expect(sent.textContent).toBe("{}");
  });

  it("sorts by the API's column key, not the table's", () => {
    render(<Harness />);

    fireEvent.click(sortControl("Tên"));

    expect(screen.getByTestId("sent").textContent).toBe(
      '{"sortBy":"name","sortOrder":"ASC"}',
    );
  });

  it("moves the sort to another column rather than keeping both", () => {
    render(<Harness />);

    fireEvent.click(sortControl("Mã"));
    fireEvent.click(sortControl("Tên"));

    expect(screen.getByTestId("sent").textContent).toBe(
      '{"sortBy":"name","sortOrder":"ASC"}',
    );
  });

  it("offers no control on a column the API cannot order by", () => {
    render(<Harness />);

    expect(
      screen.queryByRole("button", { name: /ột Tính toán/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no control while the list has not opted into sorting", () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <Table columns={COLUMNS} data={ROWS} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("button", { name: /Sắp xếp cột/ })).toBeNull();
  });
});
