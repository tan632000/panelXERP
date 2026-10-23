import { describe, expect, it } from "vitest";

import { buildExcelColumnSpec } from "@/kernel/core/lib/excel-column-spec";
import viSystem from "@/kernel/langs/vi/system.json";

import {
  parseUserImportRows,
  USER_IMPORT_MAX_DOCUMENTS,
} from "@plugins/system/users/utils/parse-user-import-rows";
import {
  buildUserExcelColumns,
  buildUserImportColumns,
  USER_EXCEL_COLUMN_KEYS,
  USER_IMPORT_COLUMN_KEYS,
  userColumnOfField,
} from "@plugins/system/users/utils/user-excel-columns";

import type { ExcelImportRow } from "@/kernel/core/types/excel";

const T = viSystem.users as Record<string, unknown>;
const header = (key: string) => T[key] as string;

const LABELS = {
  role: { planner: "Kế hoạch viên", warehouse_keeper: "Thủ kho" },
  department: { planning: "Kế hoạch", warehouse: "Kho" },
};

function row(
  fileRow: number,
  values: Record<string, string> = {},
): ExcelImportRow {
  return {
    fileRow,
    values: {
      username: `user${fileRow}`,
      fullName: "Nguyen Van A",
      email: `user${fileRow}@erp.vn`,
      roleName: "Kế hoạch viên",
      ...values,
    },
  };
}

describe("user excel columns", () => {
  it("writes the header text the table draws, in one spec for export and template", () => {
    const exportSpec = buildExcelColumnSpec(
      buildUserExcelColumns((key) => header(key)),
    );

    expect(exportSpec.columns.map((column) => column.key)).toEqual([
      ...USER_EXCEL_COLUMN_KEYS,
    ]);
    expect(exportSpec.columns.map((column) => column.label)).toEqual([
      header("username"),
      header("fullName"),
      header("email"),
      header("role"),
      header("department"),
      header("phone"),
      header("jobTitle"),
      header("status"),
      header("lastLoginAt"),
    ]);
  });

  it("gives every imported column the same header text as the export", () => {
    const exportSpec = buildExcelColumnSpec(
      buildUserExcelColumns((key) => header(key)),
    );
    const templateSpec = buildExcelColumnSpec(
      buildUserImportColumns((key) => header(key)),
    );
    const exportLabels = new Map(
      exportSpec.columns.map((column) => [column.key, column.label]),
    );

    expect(templateSpec.columns.map((column) => column.key)).toEqual([
      ...USER_IMPORT_COLUMN_KEYS,
    ]);
    for (const column of templateSpec.columns) {
      expect(column.label).toBe(exportLabels.get(column.key));
    }
  });

  it("carries no password, picture or signature column, and marks the form's required ones", () => {
    const keys = USER_EXCEL_COLUMN_KEYS as readonly string[];
    for (const secret of [
      "password",
      "passwordHash",
      "signatureUrl",
      "avatarUrl",
    ]) {
      expect(keys).not.toContain(secret);
    }
    const templateSpec = buildExcelColumnSpec(
      buildUserImportColumns((key) => header(key)),
    );

    expect(
      templateSpec.columns.filter((c) => c.required).map((c) => c.key),
    ).toEqual(["username", "fullName", "email", "roleName"]);
  });

  it("exports the status and department as the labels the screen shows", () => {
    const spec = buildExcelColumnSpec(
      buildUserExcelColumns((key) => key, {
        roleName: { Planner: "Kế hoạch viên" },
        department: LABELS.department,
        isActive: { true: "Đang hoạt động", false: "Đã vô hiệu hóa" },
      }),
    );

    expect(spec.columns.find((c) => c.key === "isActive")?.fields).toEqual([
      {
        field: "isActive",
        valueLabels: { true: "Đang hoạt động", false: "Đã vô hiệu hóa" },
      },
    ]);
  });

  it("maps a server field to its column", () => {
    expect(userColumnOfField("roleCode")).toBe("roleName");
    expect(userColumnOfField("email")).toBe("email");
    expect(userColumnOfField("password")).toBeUndefined();
  });
});

describe("parseUserImportRows", () => {
  it("turns each row into a create payload, resolving the role and department labels", () => {
    const { documents, issues } = parseUserImportRows(
      [
        row(2),
        row(3, {
          roleName: "warehouse_keeper",
          department: "Kho",
          phone: "0901 234 567",
          title: "Thủ kho",
          email: "  Kho@ERP.vn ",
        }),
      ],
      LABELS,
    );

    expect(issues).toEqual([]);
    expect(documents).toEqual([
      {
        fileRow: 2,
        username: "user2",
        email: "user2@erp.vn",
        fullName: "Nguyen Van A",
        roleCode: "planner",
      },
      {
        fileRow: 3,
        username: "user3",
        email: "kho@erp.vn",
        fullName: "Nguyen Van A",
        roleCode: "warehouse_keeper",
        department: "warehouse",
        phone: "0901 234 567",
        title: "Thủ kho",
      },
    ]);
    // A password is never part of a document.
    expect(Object.keys(documents[0])).not.toContain("password");
  });

  it("names the column and reason of every broken rule and imports none of those rows", () => {
    const { documents, issues } = parseUserImportRows(
      [
        row(2, { username: "ab" }),
        row(3, { username: "bad user" }),
        row(4, { email: "not-an-email" }),
        row(5, { roleName: "Ghost" }),
        row(6, { department: "Boardroom" }),
        row(7, { phone: "1".repeat(21) }),
        row(8, { fullName: "x".repeat(101) }),
      ],
      LABELS,
    );

    expect(documents).toEqual([]);
    expect(issues).toEqual([
      { fileRow: 2, column: "username", code: "usernameTooShort" },
      { fileRow: 3, column: "username", code: "invalidFormat" },
      { fileRow: 4, column: "email", code: "invalidFormat" },
      { fileRow: 5, column: "roleName", code: "unknownRole" },
      { fileRow: 6, column: "department", code: "invalidOption" },
      { fileRow: 7, column: "phone", code: "tooLong" },
      { fileRow: 8, column: "fullName", code: "tooLong" },
    ]);
  });

  it("flags a username or email the file repeats on its later row, ignoring case", () => {
    const { documents, issues } = parseUserImportRows(
      [
        row(2, { username: "Planner", email: "p@erp.vn" }),
        row(3, { username: "planner", email: "other@erp.vn" }),
        row(4, { username: "third", email: "P@erp.vn" }),
      ],
      LABELS,
    );

    expect(documents.map((document) => document.fileRow)).toEqual([2]);
    expect(issues).toEqual([
      { fileRow: 3, column: "username", code: "duplicateUsername" },
      { fileRow: 4, column: "email", code: "duplicateEmail" },
    ]);
  });

  it("leaves a blank required cell to the kernel's requiredMissing, writing no document", () => {
    const { documents, issues } = parseUserImportRows(
      [row(2, { fullName: "" })],
      LABELS,
    );

    expect(documents).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("refuses a file over the request's document ceiling", () => {
    const rows = Array.from({ length: USER_IMPORT_MAX_DOCUMENTS + 1 }, (_, i) =>
      row(i + 2),
    );

    const { documents, issues } = parseUserImportRows(rows, LABELS);

    expect(documents).toEqual([]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "tooManyDocuments" }),
    ]);
  });
});
