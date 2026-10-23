import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableMobileCardList } from "@/kernel/core/components/ui/TableMobileCardList";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

afterEach(cleanup);

interface Line {
  id: string;
  receiptNo: string;
  receiptDate: string;
  supplier: string;
  materialCode: string;
  quantity: number;
  status: string;
  lotNo: string;
}

const lines: Line[] = [
  {
    id: "1",
    receiptNo: "PNK-01",
    receiptDate: "09/10/2026",
    supplier: "Đại Thủy",
    materialCode: "VT_01",
    quantity: 10,
    status: "Đã nhập kho",
    lotNo: "LOT-1",
  },
  {
    id: "2",
    receiptNo: "PNK-01",
    receiptDate: "09/10/2026",
    supplier: "Đại Thủy",
    materialCode: "VT_02",
    quantity: 20,
    status: "Đã nhập kho",
    lotNo: "LOT-2",
  },
  {
    id: "3",
    receiptNo: "PNK-01",
    receiptDate: "09/10/2026",
    supplier: "Đại Thủy",
    materialCode: "VT_03",
    quantity: 30,
    status: "Đã nhập kho",
    lotNo: "LOT-3",
  },
  {
    id: "4",
    receiptNo: "PNK-02",
    receiptDate: "10/10/2026",
    supplier: "Kiên Tú",
    materialCode: "VT_04",
    quantity: 40,
    status: "Tạm nhập chờ QC",
    lotNo: "LOT-4",
  },
];

const columns: Array<TableColumn<Line>> = [
  {
    key: "receiptNo",
    header: "Số phiếu",
    mobile: { role: "title", record: true },
  },
  {
    key: "receiptDate",
    header: "Ngày nhập",
    mobile: { role: "date", record: true },
  },
  { key: "supplier", header: "NCC", mobile: { record: true } },
  { key: "materialCode", header: "Mã vật tư", mobile: { role: "title" } },
  { key: "lotNo", header: "Số lô" },
  {
    key: "quantity",
    header: "SL nhập",
    mobile: { role: "metric", emphasis: true },
  },
  { key: "status", header: "Trạng thái", mobile: { role: "badge" } },
  {
    key: "actions",
    header: "",
    render: () => (
      <div>
        <button type="button" title="Sửa">
          ✎
        </button>
      </div>
    ),
  },
];

function renderCards(
  overrides: Partial<
    React.ComponentProps<typeof TableMobileCardList<Line>>
  > = {},
) {
  const props = {
    columns,
    data: lines,
    rowKey: (line: Line) => line.id,
    rowGroupKey: (line: Line) => line.receiptNo,
    selectable: true,
    selectedKeys: [] as string[],
    onSelectKeys: vi.fn(),
    onRowClick: vi.fn(),
    emptyText: "Không có dữ liệu",
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <TableMobileCardList {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("TableMobileCardList", () => {
  it("draws one card per record, with the record columns once in its header", () => {
    renderCards();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getAllByText("PNK-01")).toHaveLength(1);
    expect(within(cards[0]).getAllByText("Đại Thủy")).toHaveLength(1);
    expect(within(cards[0]).getByText("VT_01")).toBeTruthy();
  });

  it("folds the lines past the second behind a show-more button", () => {
    renderCards();
    const [grouped] = screen.getAllByRole("listitem");
    expect(within(grouped).queryByText("VT_03")).toBeNull();
    fireEvent.click(
      within(grouped).getByRole("button", { name: "Xem thêm 1 dòng" }),
    );
    expect(within(grouped).getByText("VT_03")).toBeTruthy();
  });

  it("ticks one line at a time, as the table's rows do", () => {
    const props = renderCards();
    const [grouped, single] = screen.getAllByRole("listitem");
    const boxes = within(grouped).getAllByRole("checkbox", {
      name: "Chọn dòng",
    });
    // One per visible line; the folded third line keeps its own until shown.
    expect(boxes).toHaveLength(2);
    fireEvent.click(boxes[1]);
    expect(props.onSelectKeys).toHaveBeenCalledWith(["2"], true);

    fireEvent.click(
      within(single).getByRole("checkbox", { name: "Chọn dòng" }),
    );
    expect(props.onSelectKeys).toHaveBeenCalledWith(["4"], true);
  });

  it("offers select-all over the page's selectable rows", () => {
    const onChange = vi.fn();
    renderCards({
      selectAll: { checked: false, indeterminate: false, count: 4, onChange },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả (4)" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("opens the line that was tapped rather than the record's first line", () => {
    const props = renderCards();
    const [grouped] = screen.getAllByRole("listitem");
    fireEvent.click(within(grouped).getByText("VT_02"));
    expect(props.onRowClick).toHaveBeenCalledWith(lines[1], 1);
  });

  it("draws a one-line record flat, its line badge among the header chips", () => {
    renderCards();
    const single = screen.getAllByRole("listitem")[1];
    expect(single.querySelector("[data-card-line]")).toBeNull();
    expect(within(single).getByText("Tạm nhập chờ QC")).toBeTruthy();
    expect(within(single).getByText("40")).toBeTruthy();
  });

  it("says a status every line shares once, and keeps a differing one on its line", () => {
    renderCards();
    const [grouped] = screen.getAllByRole("listitem");
    expect(within(grouped).getAllByText("Đã nhập kho")).toHaveLength(1);
    expect(within(grouped).getByText("3 dòng")).toBeTruthy();

    cleanup();
    renderCards({
      data: lines.map((line) =>
        line.id === "2" ? { ...line, status: "Tạm nhập chờ QC" } : line,
      ),
    });
    const [mixed] = screen.getAllByRole("listitem");
    expect(within(mixed).getAllByText("Đã nhập kho")).toHaveLength(2);
    expect(within(mixed).getByText("Tạm nhập chờ QC")).toBeTruthy();
  });

  it("names an iconed action with its one word, keeping the full tooltip", () => {
    renderCards({
      columns: [
        ...columns.filter((column) => column.key !== "actions"),
        {
          key: "actions",
          header: "",
          render: () => (
            <div>
              <button type="button" title="Xoá dòng vật tư khỏi phiếu">
                <svg className="tabler-icon tabler-icon-trash" />
              </button>
              <button
                type="button"
                title="Xuất kho lô này"
                data-card-label="Xuất lô"
              >
                <svg className="tabler-icon tabler-icon-truck" />
              </button>
            </div>
          ),
        },
      ],
    });
    const single = screen.getAllByRole("listitem")[1];
    const remove = within(single).getByTitle("Xoá dòng vật tư khỏi phiếu");
    expect(remove.getAttribute("data-card-label")).toBe("Xoá");
    expect(
      within(single)
        .getByTitle("Xuất kho lô này")
        .getAttribute("data-card-label"),
    ).toBe("Xuất lô");
  });

  it("keeps the row actions on the card", () => {
    renderCards();
    const single = screen.getAllByRole("listitem")[1];
    expect(within(single).getByTitle("Sửa")).toBeTruthy();
  });
});
