import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table } from "@/kernel/core/components/ui/Table";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

interface Row {
  id: number;
  code: string;
}

const ROWS: Row[] = [{ id: 1, code: "VT_0001" }];

afterEach(cleanup);

function renderTable(onAction = vi.fn()) {
  const onRowClick = vi.fn();
  const columns: Array<TableColumn<Row>> = [
    { key: "code", header: "Mã" },
    {
      key: "actions",
      header: "",
      render: () => (
        <button type="button" onClick={onAction}>
          Xuất kho nhanh
        </button>
      ),
    },
  ];
  render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <Table<Row>
        columns={columns}
        data={ROWS}
        rowKey={(row) => String(row.id)}
        selectable
        selectedKeys={[]}
        onSelectionChange={vi.fn()}
        onRowClick={onRowClick}
      />
    </NextIntlClientProvider>,
  );
  return { onRowClick, onAction };
}

describe("table row double-click", () => {
  it("opens the row when the row itself is double-clicked", () => {
    const { onRowClick } = renderTable();

    fireEvent.doubleClick(screen.getByText("VT_0001"));

    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("leaves the row closed when an action button is double-clicked", () => {
    const { onRowClick } = renderTable();

    fireEvent.doubleClick(screen.getByText("Xuất kho nhanh"));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("leaves the row closed when its checkbox is double-clicked", () => {
    const { onRowClick } = renderTable();

    // [0] is the header's select-all box; [1] is the row's own.
    fireEvent.doubleClick(screen.getAllByRole("checkbox")[1]);

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
