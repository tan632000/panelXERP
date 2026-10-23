"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import api from "@/kernel/core/api/api";
import { excelApiStatus } from "@/kernel/core/lib/excel-jobs-api";
import { excelJobsStore } from "@/kernel/core/lib/excel-jobs-store";
import { toast } from "@/kernel/core/lib/toast";

import type { ExcelSheetEntry } from "@/kernel/core/types/excel";

export interface UseSheetsExportOptions {
  /** Feature route that queues the multi-sheet export, e.g. `/reports/sales/export`. */
  endpoint: string;
}

/**
 * Queues a multi-sheet Excel export — one worksheet per table a screen shows, for a screen
 * such as a report that is not one list. The job then appears in the job panel, which follows
 * its progress and offers the download, exactly as a list export does.
 */
export function useSheetsExport({ endpoint }: UseSheetsExportOptions) {
  const t = useTranslations("common");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The state update lands after the next render; a second click in between must still wait.
  const inFlight = useRef(false);

  const exportSheets = useCallback(
    async (
      body: Record<string, unknown> & { sheets: ExcelSheetEntry[] },
      label: string,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setIsSubmitting(true);
      try {
        const { data } = await api.post<{ jobId: string }>(endpoint, body);
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
    [endpoint, t],
  );

  return { exportSheets, isSubmitting };
}
