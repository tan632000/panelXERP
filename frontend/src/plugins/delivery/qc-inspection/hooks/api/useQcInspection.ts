"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { qcChecklistQueryKeys } from "@plugins/delivery/qc-checklist/constants";
import { qcQueryKeys } from "@plugins/delivery/qc-inspection/constants";
import {
  createQcRound,
  fetchQcPhotoContent,
  fixQcDefect,
  getQcDefects,
  getQcUnit,
  getQcUnits,
  uploadQcPhoto,
  verifyQcDefect,
} from "@plugins/delivery/qc-inspection/services/qc-inspection.service";

import type {
  QcDefectListParams,
  QcRoundInput,
  QcUnitListParams,
} from "@plugins/delivery/qc-inspection/types";

const TOAST = "delivery.toast";

export function useQcUnits(params: QcUnitListParams) {
  return useQuery({
    queryKey: qcQueryKeys.units({ ...params }),
    queryFn: () => getQcUnits(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useQcUnit(unitId: number | null) {
  return useQuery({
    queryKey: qcQueryKeys.unit(unitId ?? 0),
    queryFn: () => getQcUnit(unitId as number),
    enabled: unitId !== null && unitId > 0,
  });
}

export function useQcDefects(params: QcDefectListParams) {
  return useQuery({
    queryKey: qcQueryKeys.defects({ ...params }),
    queryFn: () => getQcDefects(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** The bytes of one photo. A stored photo never changes, so it is never refetched while cached. */
export function useQcPhotoContent(photoId: number) {
  return useQuery({
    queryKey: qcQueryKeys.photoContent(photoId),
    queryFn: () => fetchQcPhotoContent(photoId),
    staleTime: Infinity,
  });
}

export interface RecordQcRoundInput extends QcRoundInput {
  /** Photos picked per checklist item id; they are uploaded once the round exists. */
  photos: Record<number, File[]>;
}

/**
 * Records the round, then uploads the picked photos to the round's items. A refused round (409:
 * the checklist or the cabinet changed since the form loaded) reloads the template and the
 * cabinet; photos that fail afterwards are reported once, the round stays recorded.
 */
export function useRecordQcRound(unitId: number) {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const { showError } = useNotification();
  const feedback = useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("qcRoundConflict");
      if (status === 400) return t("qcRoundRejected");
      return undefined;
    },
  });
  return useMutationFeedback({
    mutationFn: async ({ photos, ...input }: RecordQcRoundInput) => {
      const detail = await createQcRound(unitId, input);
      const round = detail.rounds[detail.rounds.length - 1];
      const failures: Array<number | undefined> = [];
      for (const [checklistItemId, files] of Object.entries(photos)) {
        const item = round.items.find(
          (candidate) => candidate.checklistItemId === Number(checklistItemId),
        );
        if (!item) continue;
        for (const file of files) {
          try {
            await uploadQcPhoto(item.id, file);
          } catch (error: unknown) {
            failures.push(getApiErrorStatus(error));
          }
        }
      }
      return { detail, failures };
    },
    successMessage: t("qcRoundRecorded"),
    ...feedback,
    onSuccess: ({ failures }) => {
      if (failures.length > 0) {
        showError(
          failures.includes(413) ? t("photoTooLarge") : t("photoRejected"),
        );
      }
      return qc.invalidateQueries({ queryKey: qcQueryKeys.all });
    },
    onError: (error) => {
      if (getApiErrorStatus(error) !== 409) return;
      qc.invalidateQueries({ queryKey: qcChecklistQueryKeys.all });
      qc.invalidateQueries({ queryKey: qcQueryKeys.all });
    },
  });
}

function useDefectFeedback() {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) =>
      getApiErrorStatus(error) === 409 ? t("qcDefectConflict") : undefined,
  });
}

export function useFixQcDefect() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useDefectFeedback();
  return useMutationFeedback({
    mutationFn: (input: { id: number; note: string }) =>
      fixQcDefect(input.id, input.note),
    successMessage: t("qcDefectFixed"),
    ...feedback,
    // Also after a refusal: someone else may have moved the defect on.
    onSettled: () => qc.invalidateQueries({ queryKey: qcQueryKeys.all }),
  });
}

export function useVerifyQcDefect() {
  const t = useTranslations(TOAST);
  const qc = useQueryClient();
  const feedback = useDefectFeedback();
  return useMutationFeedback({
    mutationFn: (id: number) => verifyQcDefect(id),
    successMessage: t("qcDefectVerified"),
    ...feedback,
    onSettled: () => qc.invalidateQueries({ queryKey: qcQueryKeys.all }),
  });
}
