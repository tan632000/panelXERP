"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { downloadBlob } from "@/kernel/core/lib/download-blob";
import { buildExcelColumnSpec } from "@/kernel/core/lib/excel-column-spec";
import { followExcelJob } from "@/kernel/core/lib/excel-job-stream";
import {
  EXCEL_IMPORT_MAX_FILE_BYTES,
  excelApiErrorIssues,
  fetchExcelTemplate,
  getExcelParseRows,
  uploadExcelParse,
} from "@/kernel/core/lib/excel-jobs-api";

import type { ExcelSpecColumn } from "@/kernel/core/lib/excel-column-spec";
import type {
  ExcelImportError,
  ExcelImportRow,
  ExcelJobProgress,
  ExcelParseResult,
} from "@/kernel/core/types/excel";

export interface UseTableImportOptions {
  /** Import columns; their header text is what the uploaded sheet is matched against. */
  columns: readonly ExcelSpecColumn[];
  sheetName?: string;
}

export interface ExcelParseOutcome {
  rows: ExcelImportRow[];
  errors: ExcelImportError[];
}

function failed(code: string): ExcelParseOutcome {
  return { rows: [], errors: [{ fileRow: 1, code }] };
}

/**
 * Reads an uploaded `.xlsx` into rows keyed by column, through a queued parse job whose
 * progress the caller shows. Columns are matched by the header labels the template carries,
 * so the template it downloads is built from the same columns.
 */
export function useTableImport({ columns, sheetName }: UseTableImportOptions) {
  const sheet = useMemo(
    () => buildExcelColumnSpec(columns, { sheetName }),
    [columns, sheetName],
  );
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<ExcelJobProgress | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const resolvePendingRef = useRef<
    ((outcome: ExcelParseOutcome) => void) | null
  >(null);

  /** Stops a job already being followed and unblocks the promise its `parseFile` call is
   * waiting on, so a new pick or an unmount never leaves that call hanging forever. */
  const abortPending = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    resolvePendingRef.current?.(failed("aborted"));
    resolvePendingRef.current = null;
  }, []);

  useEffect(() => () => abortPending(), [abortPending]);

  const parseFile = useCallback(
    async (file: File): Promise<ExcelParseOutcome> => {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        return failed("invalidFile");
      }
      if (file.size > EXCEL_IMPORT_MAX_FILE_BYTES) {
        return failed("fileTooLarge");
      }

      abortPending();
      setIsParsing(true);
      setProgress({ stage: "queued", percent: 0 });
      try {
        let jobId: string;
        try {
          ({ jobId } = await uploadExcelParse(file, sheet, file.name));
        } catch (error) {
          return { rows: [], errors: excelApiErrorIssues(error) };
        }

        return await new Promise<ExcelParseOutcome>((resolve) => {
          const settle = (outcome: ExcelParseOutcome) => {
            stopRef.current = null;
            resolvePendingRef.current = null;
            resolve(outcome);
          };
          resolvePendingRef.current = settle;
          stopRef.current = followExcelJob(jobId, {
            onSnapshot: (snapshot) =>
              setProgress({ stage: snapshot.stage, percent: snapshot.percent }),
            onProgress: (next) =>
              setProgress((current) => ({
                stage: next.stage,
                percent: Math.max(current?.percent ?? 0, next.percent),
              })),
            onCompleted: (result) => {
              setProgress({ stage: "done", percent: 100 });
              // `requiredMissing` is non-fatal (D12): the job still completes with every row,
              // alongside the row-level issues found while reading them, so the caller's own
              // business validation can run over the same rows in the same pass.
              const issues =
                (result as ExcelParseResult | undefined)?.issues ?? [];
              getExcelParseRows(jobId)
                .then((rows) => settle({ rows, errors: issues }))
                .catch((error: unknown) =>
                  settle({ rows: [], errors: excelApiErrorIssues(error) }),
                );
            },
            onFailed: (failure) =>
              settle({
                rows: [],
                errors: failure.errors?.length
                  ? failure.errors
                  : [{ fileRow: 1, code: failure.code }],
              }),
            onConnectionLost: () => settle(failed("connectionLost")),
          });
        });
      } finally {
        setIsParsing(false);
      }
    },
    [sheet, abortPending],
  );

  const downloadTemplate = useCallback(
    async (fileName: string) => {
      downloadBlob(await fetchExcelTemplate(sheet), fileName);
    },
    [sheet],
  );

  return { parseFile, downloadTemplate, isParsing, progress, sheet };
}
