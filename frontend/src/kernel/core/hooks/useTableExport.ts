"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import api from "@/kernel/core/api/api";
import { useListColumnPreferences } from "@/kernel/core/hooks/api/useListColumnPreferences";
import { useAccessibleColumns } from "@/kernel/core/hooks/useAccessibleColumns";
import {
  buildExcelColumnSpec,
  visibleTableColumns,
} from "@/kernel/core/lib/excel-column-spec";
import { excelApiStatus } from "@/kernel/core/lib/excel-jobs-api";
import { excelJobsStore } from "@/kernel/core/lib/excel-jobs-store";
import { toast } from "@/kernel/core/lib/toast";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

export interface UseTableExportOptions<T> {
  /** Feature route that queues the export, e.g. `/service-revenue/export`. */
  endpoint: string;
  /** The same column array the list passes to its `Table`. */
  columns: Array<TableColumn<T>>;
  /** The same key the list passes to its `Table`, so hidden columns stay out of the file. */
  columnPreferenceKey?: string;
  /** Row field whose consecutive equal values form one record (the table's `rowGroupKey`). */
  rowGroupField?: string;
  sheetName?: string;
  /** File name without extension; the server adds `.xlsx` inside a `.zip`. */
  fileName: string;
  /** What the job panel calls this export. */
  label: string;
}

/**
 * Queues an Excel export of what a list shows: its visible columns, in screen order, with the
 * header labels it draws, for every row matching `query` rather than the loaded page. The
 * job then appears in the job panel, which follows its progress and offers the download.
 */
export function useTableExport<T>({
  endpoint,
  columns,
  columnPreferenceKey,
  rowGroupField,
  sheetName,
  fileName,
  label,
}: UseTableExportOptions<T>) {
  const t = useTranslations("common");
  const accessible = useAccessibleColumns(columns);
  const hideableKeys = useMemo(
    () =>
      accessible
        .filter((column) => column.hideable ?? true)
        .map((column) => column.key),
    [accessible],
  );
  // The same default the table starts from, so a column hidden until the reader opts in stays
  // out of the file too.
  const defaultHiddenKeys = useMemo(
    () =>
      accessible
        .filter((column) => (column.hideable ?? true) && column.defaultHidden)
        .map((column) => column.key),
    [accessible],
  );
  const preferences = useListColumnPreferences(
    columnPreferenceKey,
    hideableKeys,
    defaultHiddenKeys,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The state update lands after the next render; a second click in between must still wait.
  const inFlight = useRef(false);

  const exportRows = useCallback(
    async (query: Record<string, unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setIsSubmitting(true);
      try {
        const shown = columnPreferenceKey
          ? visibleTableColumns(accessible, preferences.isVisible)
          : accessible;
        const sheet = buildExcelColumnSpec(shown, { rowGroupField, sheetName });
        const { data } = await api.post<{ jobId: string }>(endpoint, {
          query,
          sheet,
          fileName,
        });
        excelJobsStore.addJob(data.jobId, label, "export");
      } catch (error) {
        toast.showError(
          excelApiStatus(error) === 429
            ? t("excel.tooManyJobs")
            : t("excel.exportFailed"),
        );
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [
      accessible,
      columnPreferenceKey,
      endpoint,
      fileName,
      label,
      preferences.isVisible,
      rowGroupField,
      sheetName,
      t,
    ],
  );

  return { exportRows, isSubmitting };
}
