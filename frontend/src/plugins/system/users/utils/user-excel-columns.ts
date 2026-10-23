import type { TableColumn } from "@/kernel/core/components/ui/Table";

export const USER_IMPORT_TEMPLATE_FILE_NAME = "NguoiDung_Import_Template.xlsx";

/**
 * The one column list the Excel export and the import template both draw from, in the
 * table's order. One row per account. The picture and signature columns are images, not
 * values, and never leave the screen.
 */
export const USER_EXCEL_COLUMN_KEYS = [
  "username",
  "fullName",
  "email",
  "roleName",
  "department",
  "phone",
  "title",
  "isActive",
  "lastLoginAt",
] as const;

export type UserExcelColumnKey = (typeof USER_EXCEL_COLUMN_KEYS)[number];

/**
 * What the template asks for. The status is not imported (an imported account starts active)
 * and the last sign-in belongs to the system, so both are export-only. No password column
 * exists anywhere: an imported account sets its own through the reset flow.
 */
export const USER_IMPORT_COLUMN_KEYS: readonly UserExcelColumnKey[] = [
  "username",
  "fullName",
  "email",
  "roleName",
  "department",
  "phone",
  "title",
];

/** Exactly the fields whose asterisk shows on the create form. */
const REQUIRED_IMPORT_COLUMNS: ReadonlySet<UserExcelColumnKey> = new Set([
  "username",
  "fullName",
  "email",
  "roleName",
]);

/**
 * Columns the table keeps out of sight until the reader turns them on; the export follows the
 * same default, so it never holds a column the screen does not show.
 */
export const USER_DEFAULT_HIDDEN_COLUMN_KEYS: ReadonlySet<UserExcelColumnKey> =
  new Set(["phone", "title"]);

/** The `system.users` key each column's header is drawn from, as the table draws it. */
export const USER_COLUMN_HEADER_KEYS: Record<UserExcelColumnKey, string> = {
  username: "username",
  fullName: "fullName",
  email: "email",
  roleName: "role",
  department: "department",
  phone: "phone",
  title: "jobTitle",
  isActive: "status",
  lastLoginAt: "lastLoginAt",
};

/** Display label per stored value, for the export's enum cells. */
export interface UserExcelValueLabels {
  roleName: Record<string, string>;
  department: Record<string, string>;
  isActive: Record<string, string>;
}

/** A `TableColumn` plus the `required` flag the sheet spec reads. */
export interface UserExcelColumn extends TableColumn<unknown> {
  key: UserExcelColumnKey;
  required?: boolean;
}

const EMPTY_LABELS: UserExcelValueLabels = {
  roleName: {},
  department: {},
  isActive: {},
};

const LABELLED: ReadonlySet<UserExcelColumnKey> = new Set([
  "roleName",
  "department",
  "isActive",
]);

/**
 * The export's columns. `t` receives the `system.users` key of the header, so the sheet's
 * header text is the text the table draws. `labels` is only needed to export.
 */
export function buildUserExcelColumns(
  t: (key: string) => string,
  labels: UserExcelValueLabels = EMPTY_LABELS,
): UserExcelColumn[] {
  return USER_EXCEL_COLUMN_KEYS.map((key) => ({
    key,
    header: t(USER_COLUMN_HEADER_KEYS[key]),
    ...(LABELLED.has(key)
      ? {
          export: {
            fields: [
              {
                field: key,
                valueLabels: labels[key as keyof UserExcelValueLabels],
              },
            ],
          },
        }
      : {}),
    ...(USER_DEFAULT_HIDDEN_COLUMN_KEYS.has(key)
      ? { defaultHidden: true }
      : {}),
    ...(REQUIRED_IMPORT_COLUMNS.has(key) ? { required: true } : {}),
  }));
}

/** The template's columns: the export's own, minus the ones an import never reads. */
export function buildUserImportColumns(
  t: (key: string) => string,
): UserExcelColumn[] {
  return buildUserExcelColumns(t).filter((column) =>
    USER_IMPORT_COLUMN_KEYS.includes(column.key),
  );
}

/** The import column a server-side payload field lands in. */
export function userColumnOfField(
  field: string,
): UserExcelColumnKey | undefined {
  if (field === "roleCode") return "roleName";
  return (USER_IMPORT_COLUMN_KEYS as readonly string[]).includes(field)
    ? (field as UserExcelColumnKey)
    : undefined;
}
