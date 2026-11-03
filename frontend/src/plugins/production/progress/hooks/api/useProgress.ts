"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { productionOrderQueryKeys } from "@plugins/production/production-order/constants";
import { useOrderFeedback } from "@plugins/production/production-order/hooks/api/useProductionOrder";
import {
  progressQueryKeys,
  type ProductionStage,
  type StageAction,
} from "@plugins/production/progress/constants";
import {
  changeStage,
  fetchPhotoContent,
  getUnit,
  getUnitPhotos,
  getUnits,
  uploadUnitPhoto,
} from "@plugins/production/progress/services/progress.service";

import type {
  PhotoUploadInput,
  UnitListParams,
  UnitProgress,
} from "@plugins/production/progress/types";

export function useUnitList(params: UnitListParams, enabled = true) {
  return useQuery({
    queryKey: progressQueryKeys.list({ ...params }),
    queryFn: () => getUnits(params),
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useUnit(id: number | null) {
  return useQuery({
    queryKey: progressQueryKeys.detail(id ?? 0),
    queryFn: () => getUnit(id as number),
    enabled: id !== null && id > 0,
  });
}

/**
 * Start, finish or undo one stage. The answered cabinet replaces the cached one; the lists and
 * the production order views refresh because a finish can complete the whole order.
 */
export function useChangeStage(id: number) {
  const qc = useQueryClient();
  const feedback = useOrderFeedback();
  return useMutationFeedback({
    mutationFn: (input: {
      stage: ProductionStage;
      action: StageAction;
      reason?: string;
    }) => changeStage(id, input.stage, input.action, input.reason),
    ...feedback,
    onSuccess: (unit: UnitProgress) => {
      qc.setQueryData(progressQueryKeys.detail(unit.id), unit);
      qc.invalidateQueries({ queryKey: progressQueryKeys.all });
      qc.invalidateQueries({ queryKey: productionOrderQueryKeys.all });
    },
  });
}

export function useUnitPhotos(id: number | null) {
  return useQuery({
    queryKey: progressQueryKeys.photos(id ?? 0),
    queryFn: () => getUnitPhotos(id as number),
    enabled: id !== null && id > 0,
  });
}

/**
 * The bytes of one photo. A stored photo never changes, so it is never refetched while cached;
 * the cache drops it once no thumbnail shows it, and each thumbnail owns its own object URL.
 */
export function usePhotoContent(photoId: number) {
  return useQuery({
    queryKey: progressQueryKeys.photoContent(photoId),
    queryFn: () => fetchPhotoContent(photoId),
    staleTime: Infinity,
  });
}

/** An upload refused for its size or content says so; a refused state (order not released) is a 409. */
export function useUploadPhoto(id: number) {
  const t = useTranslations("production.toast");
  const qc = useQueryClient();
  const feedback = useOrderFeedback();
  return useMutationFeedback({
    mutationFn: (input: PhotoUploadInput) => uploadUnitPhoto(id, input),
    successMessage: t("photoUploaded"),
    ...feedback,
    resolveErrorMessage: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 413) return t("photoTooLarge");
      if (status === 400) return t("photoRejected");
      return feedback.resolveErrorMessage(error);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: progressQueryKeys.photos(id) }),
  });
}
