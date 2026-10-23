import { USER_DEPARTMENTS } from "@/kernel/core/constants/user-departments";
import {
  cellValue,
  resolveLabelledValue,
} from "@/kernel/core/lib/excel-import-rows";

import type { UserExcelColumnKey } from "./user-excel-columns";
import type { ExcelImportRow } from "@/kernel/core/types/excel";

/** Most documents one import request may carry — the backend's `EXCEL_IMPORT_MAX_DOCUMENTS`. */
export const USER_IMPORT_MAX_DOCUMENTS = 500;

/** One imported account: the create payload (without password or status) plus its sheet row. */
export interface UserImportDocument {
  fileRow: number;
  username: string;
  email: string;
  fullName: string;
  roleCode: string;
  phone?: string;
  department?: string;
  title?: string;
}

/** One problem the parser found, before it is translated for display. */
export interface UserImportIssue {
  fileRow: number;
  column?: UserExcelColumnKey;
  code: string;
  values?: Record<string, string>;
}

/** Display labels of the enum cells, so a file filled from an export re-reads. */
export interface UserImportLabels {
  /** Role label by role code. */
  role: Record<string, string>;
  /** Department label by stored department key. */
  department: Record<string, string>;
}

/** The create form's own bounds, as the DTO states them. */
const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const EMAIL_MAX = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FULL_NAME_MAX = 100;
const PHONE_MAX = 20;
const TITLE_MAX = 100;

/**
 * Validates the keyed rows a parse job returned against the create form's rules, one account
 * per row. Blank required cells are already reported by the kernel parse (`requiredMissing`),
 * so here they only mark the row invalid. A username or email the file repeats is flagged on
 * its later row, case-insensitively, as the database's own identity index compares them.
 */
export function parseUserImportRows(
  rows: readonly ExcelImportRow[],
  labels: UserImportLabels,
): { documents: UserImportDocument[]; issues: UserImportIssue[] } {
  const issues: UserImportIssue[] = [];
  const documents: UserImportDocument[] = [];

  if (rows.length > USER_IMPORT_MAX_DOCUMENTS) {
    issues.push({
      fileRow: rows[USER_IMPORT_MAX_DOCUMENTS].fileRow,
      code: "tooManyDocuments",
      values: { max: String(USER_IMPORT_MAX_DOCUMENTS) },
    });
    return { documents, issues };
  }

  const seenUsernames = new Set<string>();
  const seenEmails = new Set<string>();

  for (const row of rows) {
    const issue = (column: UserExcelColumnKey, code: string) =>
      issues.push({ fileRow: row.fileRow, column, code });
    let valid = true;
    const fail = (column: UserExcelColumnKey, code: string) => {
      issue(column, code);
      valid = false;
    };

    const username = cellValue(row, "username");
    if (!username) {
      valid = false;
    } else if (username.length < USERNAME_MIN) {
      fail("username", "usernameTooShort");
    } else if (username.length > USERNAME_MAX) {
      fail("username", "tooLong");
    } else if (!USERNAME_PATTERN.test(username)) {
      fail("username", "invalidFormat");
    } else if (seenUsernames.has(username.toLowerCase())) {
      fail("username", "duplicateUsername");
    }
    if (username) seenUsernames.add(username.toLowerCase());

    const email = cellValue(row, "email").toLowerCase();
    if (!email) {
      valid = false;
    } else if (email.length > EMAIL_MAX) {
      fail("email", "tooLong");
    } else if (!EMAIL_PATTERN.test(email)) {
      fail("email", "invalidFormat");
    } else if (seenEmails.has(email)) {
      fail("email", "duplicateEmail");
    }
    if (email) seenEmails.add(email);

    const fullName = cellValue(row, "fullName");
    if (!fullName) valid = false;
    else if (fullName.length > FULL_NAME_MAX) fail("fullName", "tooLong");

    const roleText = cellValue(row, "roleName");
    const roleCode = resolveLabelledValue(roleText, labels.role);
    if (!roleText) valid = false;
    else if (!roleCode) fail("roleName", "unknownRole");

    const departmentText = cellValue(row, "department");
    const department = departmentText
      ? resolveLabelledValue(departmentText, labels.department)
      : undefined;
    if (
      departmentText &&
      !(USER_DEPARTMENTS as readonly string[]).includes(department ?? "")
    ) {
      fail("department", "invalidOption");
    }

    const phone = cellValue(row, "phone");
    if (phone.length > PHONE_MAX) fail("phone", "tooLong");
    const title = cellValue(row, "title");
    if (title.length > TITLE_MAX) fail("title", "tooLong");

    if (!valid || !roleCode) continue;
    documents.push({
      fileRow: row.fileRow,
      username,
      email,
      fullName,
      roleCode,
      ...(phone ? { phone } : {}),
      ...(department ? { department } : {}),
      ...(title ? { title } : {}),
    });
  }

  return { documents, issues };
}
