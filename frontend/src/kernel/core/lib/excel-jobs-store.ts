import { useSyncExternalStore } from "react";

import { downloadBlob } from "@/kernel/core/lib/download-blob";
import { followExcelJob } from "@/kernel/core/lib/excel-job-stream";
import {
  excelApiStatus,
  fetchExcelDownload,
} from "@/kernel/core/lib/excel-jobs-api";

import type {
  ExcelExportResult,
  ExcelJobFailure,
  ExcelJobKind,
  ExcelJobState,
  ExcelParseResult,
} from "@/kernel/core/types/excel";

export type ExcelDownloadState =
  "idle" | "downloading" | "downloaded" | "expired";

export interface ExcelJobEntry {
  id: string;
  kind: ExcelJobKind;
  label: string;
  state: ExcelJobState | "connectionLost";
  stage: string;
  percent: number;
  result?: ExcelExportResult | ExcelParseResult;
  error?: ExcelJobFailure;
  download: ExcelDownloadState;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const stops = new Map<string, () => void>();
let jobs: readonly ExcelJobEntry[] = [];

function publish(next: readonly ExcelJobEntry[]): void {
  jobs = next;
  listeners.forEach((listener) => listener());
}

function patch(id: string, change: Partial<ExcelJobEntry>): void {
  publish(jobs.map((job) => (job.id === id ? { ...job, ...change } : job)));
}

function find(id: string): ExcelJobEntry | undefined {
  return jobs.find((job) => job.id === id);
}

function isExportResult(
  result: ExcelJobEntry["result"],
): result is ExcelExportResult {
  return Boolean(result && "fileName" in result);
}

/** Whether a finished export can still be downloaded at `now`. */
export function isExcelDownloadOpen(
  job: ExcelJobEntry,
  now = Date.now(),
): boolean {
  return (
    job.state === "completed" &&
    job.download === "idle" &&
    isExportResult(job.result) &&
    !job.result.downloaded &&
    Date.parse(job.result.expiresAt) > now
  );
}

/**
 * The Excel jobs this tab started, kept outside React.
 *
 * `ModuleShell` remounts whenever the reader moves to another module, and React state held
 * there would be lost with it; a module-level store keeps every job — and its open progress
 * stream — across in-app navigation. A full reload starts empty; the server still deletes
 * each export file on its own schedule.
 */
export const excelJobsStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getJobs(): readonly ExcelJobEntry[] {
    return jobs;
  },

  addJob(id: string, label: string, kind: ExcelJobKind): void {
    if (find(id)) return;
    publish([
      ...jobs,
      {
        id,
        kind,
        label,
        state: "waiting",
        stage: "queued",
        percent: 0,
        download: "idle",
      },
    ]);

    const stop = followExcelJob(id, {
      onSnapshot: (snapshot) =>
        patch(id, {
          state: snapshot.state,
          stage: snapshot.stage,
          percent: snapshot.percent,
          result: snapshot.result,
          error: snapshot.error,
        }),
      onProgress: (progress) =>
        patch(id, {
          state: "active",
          stage: progress.stage,
          percent: Math.max(find(id)?.percent ?? 0, progress.percent),
        }),
      onCompleted: (result) =>
        patch(id, { state: "completed", stage: "done", percent: 100, result }),
      onFailed: (error) => patch(id, { state: "failed", error }),
      onConnectionLost: () => patch(id, { state: "connectionLost" }),
    });
    stops.set(id, stop);
  },

  /**
   * Downloads a finished export once. The server deletes the file as soon as it has been
   * sent, so a second attempt — or one after the window closed — reads as expired.
   */
  async download(id: string): Promise<void> {
    const job = find(id);
    if (!job || !isExportResult(job.result)) return;
    const fileName = `${job.result.fileName}.zip`;
    patch(id, { download: "downloading" });
    try {
      const blob = await fetchExcelDownload(id);
      downloadBlob(blob, fileName);
      patch(id, { download: "downloaded" });
    } catch (error) {
      if (excelApiStatus(error) === 410) {
        patch(id, { download: "expired" });
        return;
      }
      patch(id, { download: "idle" });
      throw error;
    }
  },

  dismiss(id: string): void {
    stops.get(id)?.();
    stops.delete(id);
    publish(jobs.filter((job) => job.id !== id));
  },

  /** Drops every job and stops every stream; for tests. */
  reset(): void {
    stops.forEach((stop) => stop());
    stops.clear();
    publish([]);
  },
};

const EMPTY: readonly ExcelJobEntry[] = [];

export function useExcelJobs(): readonly ExcelJobEntry[] {
  return useSyncExternalStore(
    excelJobsStore.subscribe,
    excelJobsStore.getJobs,
    () => EMPTY,
  );
}
