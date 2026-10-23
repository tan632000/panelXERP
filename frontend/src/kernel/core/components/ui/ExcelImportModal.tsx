"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FileDropzone } from "@/kernel/core/components/ui/FileDropzone";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { ProgressBar } from "@/kernel/core/components/ui/ProgressBar";
import { useTableImport } from "@/kernel/core/hooks/useTableImport";
import { EXCEL_IMPORT_MAX_FILE_BYTES } from "@/kernel/core/lib/excel-jobs-api";

import type { ExcelSpecColumn } from "@/kernel/core/lib/excel-column-spec";
import type {
  ExcelImportError,
  ExcelImportRow,
} from "@/kernel/core/types/excel";

/** One display-ready row problem: the feature's own validation already translated its message. */
export interface ExcelImportRowError {
  fileRow: number;
  column?: string;
  message: string;
}

export interface ExcelImportValidation<T> {
  errors: ExcelImportRowError[];
  payload?: T;
}

export interface ExcelImportModalProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The import columns, including which ones are `required`. */
  columns: readonly ExcelSpecColumn[];
  sheetName?: string;
  /** File name the template downloads under. */
  templateFileName: string;
  /** The feature's own business validation of the keyed rows the sheet parsed into. */
  validateRows: (
    rows: ExcelImportRow[],
  ) => ExcelImportValidation<T> | Promise<ExcelImportValidation<T>>;
  onSubmit: (payload: T) => Promise<void>;
  /** Maps a submit rejection to row errors, or a single message; defaults to a generic error. */
  mapSubmitError?: (error: unknown) => ExcelImportRowError[] | string;
  /** Prettifies a kernel error's raw column key (e.g. a `missingColumns` issue). */
  columnLabel?: (key: string) => string;
  /**
   * Overrides a kernel issue's default message (e.g. reusing the create form's own wording for
   * a `requiredMissing` column). Returning `undefined` keeps the generic kernel message.
   */
  resolveKernelMessage?: (issue: ExcelImportError) => string | undefined;
}

/** File-level codes: the row they carry is arbitrary, so they are shown with no row number. */
const FILE_LEVEL_KERNEL_CODES = new Set([
  "missingColumns",
  "duplicateColumn",
  "invalidFile",
  "fileTooLarge",
  "emptyFile",
  "tooManyRows",
  "connectionLost",
]);

const KNOWN_KERNEL_ERROR_CODES = new Set([
  ...FILE_LEVEL_KERNEL_CODES,
  "requiredMissing",
]);

interface DisplayError {
  fileRow?: number;
  column?: string;
  message: string;
}

function defaultKernelMessage(
  code: string,
  t: (key: string) => string,
): string {
  return t(
    `common.excel.import.error.${KNOWN_KERNEL_ERROR_CODES.has(code) ? code : "server"}`,
  );
}

/** `requiredMissing` already carries the sheet's display label (set at the parser); every other
 * kernel code carries the raw column key, which `columnLabel` prettifies. */
function rowLevelColumn(
  issue: ExcelImportError,
  columnLabel: (key: string) => string,
): string | undefined {
  if (!issue.column) return undefined;
  return issue.code === "requiredMissing"
    ? issue.column
    : columnLabel(issue.column);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reusable import modal: drag-and-drop or pick an `.xlsx`, download its template, watch the
 * kernel parse job's progress, then hand the keyed rows to the feature's own `validateRows`
 * before submitting its payload. The feature owns business rules and copy for its own row
 * errors; this owns the file pick, kernel error display and submit gating.
 */
export function ExcelImportModal<T>({
  open,
  onClose,
  title,
  columns,
  sheetName,
  templateFileName,
  validateRows,
  onSubmit,
  mapSubmitError,
  columnLabel = (key) => key,
  resolveKernelMessage,
}: ExcelImportModalProps<T>) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [kernelErrors, setKernelErrors] = useState<ExcelImportError[]>([]);
  const [rowErrors, setRowErrors] = useState<ExcelImportRowError[]>([]);
  const [payload, setPayload] = useState<T | undefined>(undefined);
  const [rowCount, setRowCount] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setFile(null);
      setKernelErrors([]);
      setRowErrors([]);
      setPayload(undefined);
      setRowCount(0);
      setIsValidating(false);
      setIsSubmitting(false);
    }
  }
  const { parseFile, downloadTemplate, isParsing, progress } = useTableImport({
    columns,
    sheetName,
  });

  const clearOutcome = () => {
    setKernelErrors([]);
    setRowErrors([]);
    setPayload(undefined);
    setRowCount(0);
    setIsValidating(false);
  };

  const resetAll = () => {
    setFile(null);
    clearOutcome();
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleFile = async (picked: File) => {
    setFile(picked);
    clearOutcome();

    const outcome = await parseFile(picked);
    // A file-level (header/read) failure returns no rows at all; a `requiredMissing` issue is
    // non-fatal and still returns every row (D12/R6), so business validation still runs over
    // them and the reader sees every problem — file-level and row-level — in one pass.
    setKernelErrors(outcome.errors);
    if (outcome.rows.length === 0) {
      return;
    }

    setIsValidating(true);
    try {
      const validated = await validateRows(outcome.rows);
      setRowErrors(validated.errors);
      setPayload(validated.payload);
      setRowCount(outcome.rows.length);
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemove = () => {
    resetAll();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      isParsing ||
      isValidating ||
      isSubmitting ||
      kernelErrors.length > 0 ||
      rowErrors.length > 0 ||
      payload === undefined
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      handleClose();
    } catch (error: unknown) {
      const mapped = mapSubmitError?.(error);
      if (typeof mapped === "string") {
        setRowErrors([{ fileRow: 1, message: mapped }]);
      } else if (mapped) {
        setRowErrors(mapped);
      } else {
        setRowErrors([
          { fileRow: 1, message: t("common.excel.import.error.server") },
        ]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileLevelErrors: DisplayError[] = kernelErrors
    .filter((issue) => FILE_LEVEL_KERNEL_CODES.has(issue.code))
    .map((issue) => ({
      column: issue.column ? columnLabel(issue.column) : undefined,
      message:
        resolveKernelMessage?.(issue) ?? defaultKernelMessage(issue.code, t),
    }));
  const rowLevelErrors: DisplayError[] = [
    ...kernelErrors
      .filter((issue) => !FILE_LEVEL_KERNEL_CODES.has(issue.code))
      .map((issue) => ({
        fileRow: issue.fileRow,
        column: rowLevelColumn(issue, columnLabel),
        message:
          resolveKernelMessage?.(issue) ?? defaultKernelMessage(issue.code, t),
      })),
    ...rowErrors,
  ].sort((a, b) => (a.fileRow ?? 0) - (b.fileRow ?? 0));
  const errors = [...fileLevelErrors, ...rowLevelErrors];
  const isBusy = isParsing || isValidating || isSubmitting;
  const maxMb = Math.round(EXCEL_IMPORT_MAX_FILE_BYTES / (1024 * 1024));

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={title}
      onSubmit={handleSubmit}
      submitLabel={
        isSubmitting
          ? t("common.excel.import.submitting")
          : t("common.excel.import.submit")
      }
      cancelLabel={tCommon("cancel")}
      submitDisabled={isBusy || errors.length > 0 || payload === undefined}
      wide
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-text-secondary">
            {t("common.excel.import.helper")}
          </p>
          <button
            type="button"
            onClick={() => void downloadTemplate(templateFileName)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent text-xs font-medium text-brand hover:underline"
          >
            <Icon name="download" size={14} />
            {t("common.excel.import.downloadTemplate")}
          </button>
        </div>

        {!file ? (
          <FileDropzone
            accept=".xlsx"
            maxBytes={EXCEL_IMPORT_MAX_FILE_BYTES}
            title={t("common.excel.import.dropzoneTitle")}
            subtitle={t("common.excel.import.dropzoneSubtitle")}
            hint={t("common.excel.import.dropzoneHint", { maxMb })}
            invalidTypeMessage={t("common.excel.import.invalidFileType")}
            tooLargeMessage={t("common.excel.import.error.fileTooLarge")}
            onFile={(picked) => void handleFile(picked)}
          />
        ) : (
          <div className="rounded-lg border border-border-secondary bg-surface-secondary px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Icon
                name="file-text"
                size={22}
                className="shrink-0 text-brand"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {file.name}
                </p>
                <p className="text-xs text-text-secondary">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("common.excel.import.removeFile")}
                disabled={isBusy}
                onClick={handleRemove}
                className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-tertiary transition-colors hover:text-danger-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {isParsing ? (
              <div className="mt-2">
                <ProgressBar percent={progress?.percent ?? 0} />
                <p className="mt-1 text-xs text-text-secondary">
                  {progress?.stage ?? "queued"} · {progress?.percent ?? 0}%
                </p>
              </div>
            ) : null}

            {!isBusy && errors.length === 0 && rowCount > 0 ? (
              <p className="mt-2 flex items-center gap-1 text-sm text-success-text">
                <Icon name="check" size={15} />
                {t("common.excel.import.rowsReady", { count: rowCount })}
              </p>
            ) : null}
          </div>
        )}

        {errors.length > 0 ? (
          <section className="rounded-lg border border-danger-text bg-danger-bg p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-danger-text">
              <Icon name="alert-triangle" size={16} />
              {t("common.excel.import.errorTitle", { count: errors.length })}
            </h3>
            <ul className="max-h-60 overflow-auto text-sm text-danger-text">
              {errors.map((rowError, index) => {
                const prefix = [
                  rowError.fileRow !== undefined
                    ? t("common.excel.import.rowLabel", {
                        fileRow: rowError.fileRow,
                      })
                    : null,
                  rowError.column,
                ].filter((part): part is string => Boolean(part));
                return (
                  <li
                    key={`${rowError.fileRow ?? "file"}-${index}`}
                    className="border-b border-danger-text/30 px-1 py-1.5 last:border-0"
                  >
                    {prefix.length > 0 ? (
                      <span className="font-semibold">
                        {prefix.join(" · ")}
                        {" · "}
                      </span>
                    ) : null}
                    {rowError.message}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
