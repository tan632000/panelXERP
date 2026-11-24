"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { estimateQueryKeys } from "@plugins/sales/estimate/constants";
import { requestQueryKeys } from "@plugins/sales/request/constants";
import {
  getAiPrefillRun,
  startAiPrefill,
} from "@plugins/sales/request/services/request.service";

import type { AiPrefillRun } from "@plugins/sales/request/types";

export const AI_PREFILL_POLL_MS = 3000;

export type AiPrefillErrorKey =
  "conflict" | "unavailable" | "limitReached" | "error";

const ERROR_KEYS: Record<number, AiPrefillErrorKey> = {
  409: "conflict",
  503: "unavailable",
  429: "limitReached",
};

const isFinished = (run: AiPrefillRun | undefined) =>
  run?.status === "succeeded" || run?.status === "failed";

/**
 * Starts an AI run for a request and follows it. The query polls only while a run is
 * unfinished and stops by itself when the component unmounts.
 */
export function useAiPrefill(requestId: number) {
  const qc = useQueryClient();
  const [runId, setRunId] = useState<number | null>(null);

  const start = useMutation({
    mutationFn: () => startAiPrefill(requestId),
    onSuccess: ({ runId: id }) => setRunId(id),
  });

  const runQuery = useQuery({
    queryKey: ["sales-ai-prefill-run", runId],
    queryFn: () => getAiPrefillRun(runId as number),
    enabled: runId !== null,
    refetchInterval: (query) =>
      isFinished(query.state.data) ? false : AI_PREFILL_POLL_MS,
  });

  const finished = isFinished(runQuery.data);
  // A finished run changed the estimate, the request status and its timeline.
  useEffect(() => {
    if (!finished) return;
    qc.invalidateQueries({ queryKey: estimateQueryKeys.all });
    qc.invalidateQueries({ queryKey: requestQueryKeys.all });
  }, [finished, qc]);

  const failure = start.error ?? runQuery.error;
  return {
    run: runQuery.data,
    errorKey: failure
      ? (ERROR_KEYS[getApiErrorStatus(failure) ?? 0] ?? "error")
      : null,
    start: () => start.mutate(),
    /** True from the click until the run reaches a final state. */
    busy: start.isPending || (runId !== null && !finished),
  };
}
