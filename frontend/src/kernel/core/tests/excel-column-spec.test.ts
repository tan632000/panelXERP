import React from "react";
import { describe, expect, it } from "vitest";

import {
  buildExcelColumnSpec,
  visibleTableColumns,
} from "@/kernel/core/lib/excel-column-spec";

import type { ExcelSpecColumn } from "@/kernel/core/lib/excel-column-spec";

const COLUMNS: ExcelSpecColumn[] = [
  {
    key: "orderCode",
    header: "Mã đơn",
    groupSpan: true,
    style: { width: 140 },
  },
  {
    key: "orderDate",
    header: "Ngày/Tuần",
    export: {
      fields: [{ field: "orderDate", type: "date" }, { field: "week" }],
      joinWith: " - ",
    },
  },
  { key: "unitPrice", header: "Đơn giá", headerGroup: "Giá" },
  { key: "lineTotal", header: "Thành tiền", headerGroup: ["Giá"] },
  { key: "internalId", header: "ID nội bộ", export: false },
  { key: "actions", header: "" },
];

describe("buildExcelColumnSpec (R1.5)", () => {
  it("keeps screen order and drops meta and non-exported columns", () => {
    const spec = buildExcelColumnSpec(COLUMNS, { rowGroupField: "orderId" });

    expect(spec.columns.map((column) => column.key)).toEqual([
      "orderCode",
      "orderDate",
      "unitPrice",
      "lineTotal",
    ]);
    expect(spec.rowGroupField).toBe("orderId");
  });

  it("carries the drawn label, the group path and the value rule", () => {
    const [code, date, price, total] = buildExcelColumnSpec(COLUMNS).columns;

    expect(code).toEqual({
      key: "orderCode",
      label: "Mã đơn",
      groupSpan: true,
      width: 20,
    });
    expect(date).toEqual({
      key: "orderDate",
      label: "Ngày/Tuần",
      fields: [{ field: "orderDate", type: "date" }, { field: "week" }],
      joinWith: " - ",
    });
    expect(price.headerGroup).toEqual(["Giá"]);
    expect(total.headerGroup).toEqual(["Giá"]);
  });

  it("reads the label out of a rendered header node", () => {
    const spec = buildExcelColumnSpec([
      {
        key: "qty",
        header: React.createElement("span", null, "Số ", "lượng"),
      },
    ]);

    expect(spec.columns[0].label).toBe("Số lượng");
  });
});

describe("visibleTableColumns", () => {
  it("drops hideable columns the account hid, keeping fixed ones", () => {
    const columns: ExcelSpecColumn[] = [
      { key: "code", header: "Mã", hideable: false },
      { key: "name", header: "Tên" },
      { key: "note", header: "Ghi chú" },
    ];

    const shown = visibleTableColumns(columns, (key) => key !== "name");

    expect(shown.map((column) => column.key)).toEqual(["code", "note"]);
  });
});
