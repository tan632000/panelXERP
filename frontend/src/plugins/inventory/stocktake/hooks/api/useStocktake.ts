"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { stocktakeQueryKeys } from "@plugins/inventory/stocktake/constants";
import {
  createStocktake,
  getLocations,
  getStocktake,
  getStocktakes,
  runStocktakeAction,
  setStocktakeCount,
} from "@plugins/inventory/stocktake/services/stocktake.service";

import type { StocktakeAction } from "@plugins/inventory/stocktake/constants";
import type {
  StocktakeDetail,
  StocktakeInput,
} from "@plugins/inventory/stocktake/types";

const TOAST = "stocktake.toast";

/** A refused step (another count open, the count moved on, a result below zero) is a 409. */
function useCountFeedback() {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("conflict") : undefined,
  });
}

function useStoreDetail() {
  const qc = useQueryClient();
  return (detail: StocktakeDetail) => {
    qc.setQueryData(stocktakeQueryKeys.detail(detail.id), detail);
    qc.invalidateQueries({ queryKey: stocktakeQueryKeys.all });
  };
}

export function useStocktakeList(params: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: stocktakeQueryKeys.list(params),
    queryFn: () => getStocktakes(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useStocktake(id: number | null) {
  return useQuery({
    queryKey: stocktakeQueryKeys.detail(id ?? 0),
    queryFn: () => getStocktake(id as number),
    enabled: id !== null && id > 0,
  });
}

export function useLocations(enabled: boolean) {
  return useQuery({
    queryKey: stocktakeQueryKeys.locations,
    queryFn: getLocations,
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useCreateStocktake() {
  const t = useTranslations(TOAST);
  const feedback = useCountFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (input: StocktakeInput) => createStocktake(input),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: store,
  });
}

export function useSetStocktakeCount(id: number) {
  const feedback = useCountFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (input: { itemId: number; countedQty: number }) =>
      setStocktakeCount(id, input.itemId, input.countedQty),
    ...feedback,
    onSuccess: store,
  });
}

export function useStocktakeAction(id: number, action: StocktakeAction) {
  const t = useTranslations(TOAST);
  const feedback = useCountFeedback();
  const store = useStoreDetail();
  return useMutationFeedback({
    mutationFn: (reason?: string) => runStocktakeAction(id, action, reason),
    successMessage: t(`${action}Success`),
    ...feedback,
    onSuccess: store,
  });
}

/** Stores the detail a scan answered, so the counting screen shows it at once. */
export function useStoreStocktake() {
  return useStoreDetail();
}
