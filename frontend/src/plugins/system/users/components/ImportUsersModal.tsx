"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import {
  ExcelImportModal,
  type ExcelImportRowError,
  type ExcelImportValidation,
} from "@/kernel/core/components/ui/ExcelImportModal";
import { useUserDepartments } from "@/kernel/core/hooks/useUserDepartments";
import { mapExcelImportServerErrors } from "@/kernel/core/lib/excel-import-server-errors";
import { toast } from "@/kernel/core/lib/toast";

import { useRoleLabels } from "@plugins/system/roles/hooks/useRoleLabels";
import {
  useAssignableRoles,
  useImportAdminUsers,
} from "@plugins/system/users/hooks/api/useAdminUsers";
import {
  parseUserImportRows,
  type UserImportDocument,
  type UserImportIssue,
} from "@plugins/system/users/utils/parse-user-import-rows";
import {
  buildUserImportColumns,
  USER_COLUMN_HEADER_KEYS,
  USER_IMPORT_TEMPLATE_FILE_NAME,
  userColumnOfField,
  type UserExcelColumnKey,
} from "@plugins/system/users/utils/user-excel-columns";

import type { ExcelImportRow } from "@/kernel/core/types/excel";

export interface ImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Codes the kernel's generic `common.excel.import.error.*` set words; every other code is the
 * screen's own `system.users.import.error.<code>`.
 */
const COMMON_ISSUE_CODES = new Set([
  "tooLong",
  "invalidFormat",
  "invalidOption",
  "tooManyDocuments",
]);

/**
 * The create path's own conflict wording, which the backend sends as a `rejected` row's
 * message. English by contract and never shown: each is mapped to a key here.
 */
const REJECTED_MESSAGE_KEYS: Array<[string, string]> = [
  ["username is already in use", "usernameTaken"],
  ["email is already in use", "emailTaken"],
  ["unknown role code", "unknownRole"],
];

/** Account import: the export's own columns in, the create form's rules applied row by row. */
export function ImportUsersModal({
  isOpen,
  onClose,
}: Readonly<ImportUsersModalProps>) {
  const t = useTranslations("system.users");
  const tCommon = useTranslations("common");
  const roles = useAssignableRoles().data;
  const { labelOfCode } = useRoleLabels();
  const { options: departmentOptions } = useUserDepartments();
  const importMutation = useImportAdminUsers();

  const columns = useMemo(() => buildUserImportColumns((key) => t(key)), [t]);
  const labels = useMemo(
    () => ({
      role: Object.fromEntries(
        (roles ?? []).map((role) => [
          role.code,
          labelOfCode(role.code, role.name),
        ]),
      ),
      department: Object.fromEntries(
        departmentOptions.map((option) => [option.value, option.label]),
      ),
    }),
    [roles, labelOfCode, departmentOptions],
  );

  const columnLabel = (column: UserExcelColumnKey) =>
    t(USER_COLUMN_HEADER_KEYS[column]);

  const issueMessage = (issue: UserImportIssue) =>
    COMMON_ISSUE_CODES.has(issue.code)
      ? tCommon(`excel.import.error.${issue.code}`, issue.values)
      : t(`import.error.${issue.code}`, issue.values);

  const validateRows = (
    rows: ExcelImportRow[],
  ): ExcelImportValidation<UserImportDocument[]> => {
    const { documents, issues } = parseUserImportRows(rows, labels);
    return {
      errors: issues.map((issue) => ({
        fileRow: issue.fileRow,
        ...(issue.column ? { column: columnLabel(issue.column) } : {}),
        message: issueMessage(issue),
      })),
      payload: documents.length > 0 ? documents : undefined,
    };
  };

  const handleSubmit = async (documents: UserImportDocument[]) => {
    const result = await importMutation.mutateAsync(documents);
    toast.showSuccess(t("import.success", { count: result.created }));
  };

  const mapSubmitError = (error: unknown): ExcelImportRowError[] =>
    mapExcelImportServerErrors(error, {
      tCommon: (key) => tCommon(key),
      columnOf: (field) => {
        const column = userColumnOfField(field);
        return column ? columnLabel(column) : undefined;
      },
      resolveRejected: (message) => {
        const lower = message.toLowerCase();
        const hit = REJECTED_MESSAGE_KEYS.find(([text]) =>
          lower.includes(text),
        );
        return hit ? t(`import.error.${hit[1]}`) : undefined;
      },
    });

  return (
    <ExcelImportModal<UserImportDocument[]>
      open={isOpen}
      onClose={onClose}
      title={t("import.title")}
      columns={columns}
      templateFileName={USER_IMPORT_TEMPLATE_FILE_NAME}
      validateRows={validateRows}
      onSubmit={handleSubmit}
      mapSubmitError={mapSubmitError}
      columnLabel={(key) => columnLabel(key as UserExcelColumnKey)}
    />
  );
}
