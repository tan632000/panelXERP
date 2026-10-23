import type { ExcelImportRowError } from "@/kernel/core/components/ui/ExcelImportModal";

/** One row a feature import endpoint rejected (`runExcelImport` on the backend). */
export interface ExcelImportServerError {
  fileRow: number;
  /** Payload field, e.g. `date` or `lines.qtyPcs`. */
  field?: string;
  code: string;
  message?: string;
}

/**
 * The generic `common.excel.import.error.*` key per backend code. Constraint names come from
 * class-validator; `duplicateCode`, `codeNotFound` and `rejected` from the import runner.
 */
const SERVER_CODE_KEYS: Record<string, string> = {
  duplicateCode: "duplicateCode",
  codeNotFound: "codeNotFound",
  isString: "required",
  minLength: "required",
  isNotEmpty: "required",
  arrayMinSize: "required",
  isDefined: "required",
  maxLength: "tooLong",
  isNumber: "invalidNumber",
  isInt: "invalidInteger",
  isPositive: "mustBePositive",
  min: "mustBeNonNegative",
  isEnum: "invalidOption",
  isDateOnly: "invalidDate",
  matches: "invalidFormat",
};

/** The `errors` array of a rejected import response, or `[]` when it carries none. */
export function excelImportServerErrors(
  error: unknown,
): ExcelImportServerError[] {
  if (!error || typeof error !== "object" || !("response" in error)) return [];
  const response = error.response;
  if (!response || typeof response !== "object" || !("data" in response)) {
    return [];
  }
  const data = response.data as { errors?: unknown } | undefined;
  if (!Array.isArray(data?.errors)) return [];
  return data.errors.filter(
    (item): item is ExcelImportServerError =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as ExcelImportServerError).fileRow === "number" &&
      typeof (item as ExcelImportServerError).code === "string",
  );
}

export interface ExcelImportServerErrorOptions {
  /** `common`-namespace translator. */
  tCommon: (key: string) => string;
  /** The column label a payload field is shown under; `undefined` names no column. */
  columnOf: (field: string) => string | undefined;
  /**
   * Translates a service rule's own message (a `rejected` error), e.g. through the feature's
   * API-error mapper. `undefined` falls back to a generic message: the server's wording is
   * English by contract and is never shown (see `useMutationFeedback`).
   */
  resolveRejected?: (message: string) => string | undefined;
}

/**
 * Turns a rejected import into display rows, each naming its sheet row, column and reason.
 * A request that failed without row errors (network, 5xx) becomes one generic message.
 */
export function mapExcelImportServerErrors(
  error: unknown,
  options: ExcelImportServerErrorOptions,
): ExcelImportRowError[] {
  const serverErrors = excelImportServerErrors(error);
  if (serverErrors.length === 0) {
    return [
      {
        fileRow: 1,
        message: options.tCommon("excel.import.error.server"),
      },
    ];
  }
  return serverErrors.map((serverError) => {
    const column = serverError.field
      ? options.columnOf(serverError.field)
      : undefined;
    let message: string;
    if (serverError.code === "rejected") {
      message =
        (serverError.message
          ? options.resolveRejected?.(serverError.message)
          : undefined) ?? options.tCommon("excel.import.error.rejected");
    } else {
      const key = SERVER_CODE_KEYS[serverError.code] ?? "invalidValue";
      message = options.tCommon(`excel.import.error.${key}`);
    }
    return {
      fileRow: serverError.fileRow,
      ...(column ? { column } : {}),
      message,
    };
  });
}
