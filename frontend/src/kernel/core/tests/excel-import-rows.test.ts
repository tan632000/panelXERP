import { describe, expect, it } from "vitest";

import {
  groupImportRows,
  parseDateCell,
  parseNumberCell,
  resolveLabelledValue,
} from "@/kernel/core/lib/excel-import-rows";

import type { ExcelImportRow } from "@/kernel/core/types/excel";

function row(fileRow: number, values: Record<string, string>): ExcelImportRow {
  return { fileRow, values };
}

describe("groupImportRows", () => {
  const options = { codeKey: "code", headerKeys: ["date", "pic"] };

  it("joins rows sharing a code wherever they sit, case-insensitively", () => {
    const { groups, conflicts } = groupImportRows(
      [
        row(2, { code: "S-1", date: "2026-09-01", pic: "An" }),
        row(3, { code: "S-2", date: "2026-09-02", pic: "Binh" }),
        row(4, { code: "s-1", date: "2026-09-01", pic: "An" }),
      ],
      options,
    );

    expect(groups.map((group) => group.rows.map((r) => r.fileRow))).toEqual([
      [2, 4],
      [3],
    ]);
    expect(groups[0]).toMatchObject({ code: "S-1", fileRow: 2 });
    expect(conflicts).toEqual([]);
  });

  it("merges consecutive blank-code rows only while their header agrees", () => {
    const { groups } = groupImportRows(
      [
        row(2, { date: "2026-09-01", pic: "An" }),
        row(3, { date: "2026-09-01", pic: "An" }),
        row(4, { date: "2026-09-01", pic: "Binh" }),
        row(5, { code: "S-1", date: "2026-09-01", pic: "Binh" }),
        row(6, { date: "2026-09-01", pic: "Binh" }),
      ],
      options,
    );

    expect(groups.map((group) => group.rows.map((r) => r.fileRow))).toEqual([
      [2, 3],
      [4],
      [5],
      [6],
    ]);
  });

  it("reports a later row of a code whose header disagrees with the first", () => {
    const { conflicts } = groupImportRows(
      [
        row(2, { code: "S-1", date: "2026-09-01", pic: "An" }),
        row(3, { code: "S-1", date: "2026-09-02", pic: "An" }),
      ],
      options,
    );

    expect(conflicts).toEqual([{ fileRow: 3, column: "date" }]);
  });
});

describe("cell parsing", () => {
  it("reads numbers, leaving blank as undefined and garbage as null", () => {
    expect(parseNumberCell(" 12.5 ")).toBe(12.5);
    expect(parseNumberCell("")).toBeUndefined();
    expect(parseNumberCell("12a")).toBeNull();
  });

  it("reads ISO and displayed dates, refusing impossible ones", () => {
    expect(parseDateCell("2026-09-28")).toBe("2026-09-28");
    expect(parseDateCell("8/9/2026")).toBe("2026-09-08");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("")).toBeUndefined();
  });

  it("resolves a stored value from either its label or itself", () => {
    const labels = { screw: "Vít", nut: "Đai ốc" };
    expect(resolveLabelledValue("vít", labels)).toBe("screw");
    expect(resolveLabelledValue("nut", labels)).toBe("nut");
    expect(resolveLabelledValue("bolt", labels)).toBeUndefined();
  });
});
