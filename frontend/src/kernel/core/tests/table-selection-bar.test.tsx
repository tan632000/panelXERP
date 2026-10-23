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

const ROWS: Row[] = [
  { id: 1, code: "VT_0001" },
  { id: 2, code: "VT_0002" },
];

const COLUMNS: Array<TableColumn<Row>> = [{ key: "code", header: "Mã" }];

afterEach(cleanup);

function renderTable(
  overrides: Partial<Parameters<typeof Table<Row>>[0]> = {},
) {
  const onSelectionChange = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <Table<Row>
        columns={COLUMNS}
        data={ROWS}
        selectable
        selectedKeys={["1", "2"]}
        onSelectionChange={onSelectionChange}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onSelectionChange };
}

describe("table selection bar", () => {
  it("stays absent while no row is ticked", () => {
    renderTable({ selectedKeys: [] });

    expect(screen.queryByText(viCommon.bulkDelete.clearSelection)).toBeNull();
  });

  it("counts the ticked rows above them", () => {
    renderTable();

    expect(screen.getByText("Đã chọn 2 dòng")).toBeTruthy();
  });

  it("unticks every row from the bar", () => {
    const { onSelectionChange } = renderTable();

    fireEvent.click(screen.getByText(viCommon.bulkDelete.clearSelection));

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it("carries the actions of the list beside the count", () => {
    renderTable({ selectionActions: <button type="button">Xoá (2)</button> });

    expect(screen.getByText("Xoá (2)")).toBeTruthy();
  });

  it("carries no bar when the table has no checkbox column", () => {
    renderTable({ selectable: false, selectionActions: <span>Xoá</span> });

    expect(screen.queryByText(viCommon.bulkDelete.clearSelection)).toBeNull();
    expect(screen.queryByText("Xoá")).toBeNull();
  });
  it("adds this page to the selection instead of replacing it", () => {
    const { onSelectionChange } = renderTable({ selectedKeys: ["1"] });

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(onSelectionChange).toHaveBeenCalledWith(["1", "2"]);
  });

  it("unticks this page when the header checkbox is cleared", () => {
    const { onSelectionChange } = renderTable();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it("drops rows that left the page from a list with bulk actions", () => {
    const { onSelectionChange } = renderTable({
      selectedKeys: ["1", "2", "77"],
      selectionActions: <button type="button">Duyệt</button>,
    });

    expect(onSelectionChange).toHaveBeenCalledWith(["1", "2"]);
  });

  it("keeps a picker's selection across searches", () => {
    const { onSelectionChange } = renderTable({ selectedKeys: ["1", "77"] });

    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
