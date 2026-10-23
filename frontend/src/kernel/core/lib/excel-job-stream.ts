import {
  excelApiRoutes,
  excelApiStatus,
  excelApiUrl,
  getExcelJob,
} from "@/kernel/core/lib/excel-jobs-api";
import { readSseStream } from "@/kernel/core/lib/sse-stream";

import type {
  ExcelExportResult,
  ExcelJobFailure,
  ExcelJobProgress,
  ExcelJobSnapshot,
  ExcelParseResult,
} from "@/kernel/core/types/excel";

/** How many times one job's stream is reopened after a drop before giving up on it. */
export const EXCEL_STREAM_MAX_RECONNECTS = 3;

const RECONNECT_BASE_DELAY_MS = 500;

export interface ExcelJobStreamHandlers {
  onSnapshot: (snapshot: ExcelJobSnapshot) => void;
  onProgress: (progress: ExcelJobProgress) => void;
  onCompleted: (
    result: ExcelExportResult | ExcelParseResult | undefined,
  ) => void;
  onFailed: (failure: ExcelJobFailure) => void;
  /** The stream could not be reopened; the job itself may still be running on the server. */
  onConnectionLost: () => void;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Follows one Excel job until it completes or fails, and returns a function that stops.
 *
 * A dropped stream, or one refused with 401 because the token expired while the job ran, is
 * recovered by re-reading the job through the axios client — whose interceptor refreshes the
 * token — and reopening the stream with the new one.
 */
export function followExcelJob(
  jobId: string,
  handlers: ExcelJobStreamHandlers,
  options: { maxReconnects?: number } = {},
): () => void {
  const controller = new AbortController();
  const maxReconnects = options.maxReconnects ?? EXCEL_STREAM_MAX_RECONNECTS;
  let finished = false;

  const settle = (snapshot: ExcelJobSnapshot): boolean => {
    if (snapshot.state === "completed") {
      finished = true;
      handlers.onCompleted(snapshot.result);
    } else if (snapshot.state === "failed") {
      finished = true;
      handlers.onFailed(snapshot.error ?? { code: "internal" });
    }
    return finished;
  };

  const run = async () => {
    let reconnects = 0;
    while (!finished && !controller.signal.aborted) {
      try {
        await readSseStream(
          excelApiUrl(excelApiRoutes.events(jobId)),
          controller.signal,
          ({ event, data }) => {
            const payload: unknown = JSON.parse(data);
            if (event === "snapshot") {
              const snapshot = payload as ExcelJobSnapshot;
              handlers.onSnapshot(snapshot);
              settle(snapshot);
            } else if (event === "progress") {
              handlers.onProgress(payload as ExcelJobProgress);
            } else if (event === "completed") {
              finished = true;
              handlers.onCompleted(
                payload as ExcelExportResult | ExcelParseResult,
              );
            } else if (event === "failed") {
              finished = true;
              handlers.onFailed(payload as ExcelJobFailure);
            }
          },
        );
      } catch {
        // A drop, a refusal or an abort; the checks below decide what happens next.
      }
      if (finished || controller.signal.aborted) return;

      reconnects += 1;
      if (reconnects > maxReconnects) {
        finished = true;
        handlers.onConnectionLost();
        return;
      }
      await wait(RECONNECT_BASE_DELAY_MS * reconnects, controller.signal);
      if (controller.signal.aborted) return;
      try {
        const snapshot = await getExcelJob(jobId);
        handlers.onSnapshot(snapshot);
        if (settle(snapshot)) return;
      } catch (error) {
        if (excelApiStatus(error) === 404) {
          finished = true;
          handlers.onFailed({ code: "jobNotFound" });
          return;
        }
      }
    }
  };

  void run();
  return () => controller.abort();
}
