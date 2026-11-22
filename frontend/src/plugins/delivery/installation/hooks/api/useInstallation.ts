"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { installationQueryKeys } from "@plugins/delivery/installation/constants";
import {
  createInstallation,
  fetchInstallationPhotoContent,
  finishInstallation,
  getInstallations,
  getOrderInstallation,
  startInstallation,
  uploadInstallationPhoto,
} from "@plugins/delivery/installation/services/installation.service";

import type {
  InstallationInput,
  InstallationListParams,
} from "@plugins/delivery/installation/types";

const TOAST = "delivery.toast";

export function useInstallations(params: InstallationListParams) {
  return useQuery({
    queryKey: installationQueryKeys.list({ ...params }),
    queryFn: () => getInstallations(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useOrderInstallation(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: installationQueryKeys.order(orderId ?? 0),
    queryFn: () => getOrderInstallation(orderId as number),
    enabled: enabled && orderId !== null && orderId > 0,
  });
}

/** The bytes of one photo. A stored photo never changes, so it is never refetched while cached. */
export function useInstallationPhotoContent(photoId: number) {
  return useQuery({
    queryKey: installationQueryKeys.photoContent(photoId),
    queryFn: () => fetchInstallationPhotoContent(photoId),
    staleTime: Infinity,
  });
}

/**
 * A refused state (wrong order or installation status) is a 409 with one localized sentence:
 * the server's wording is never shown. A 400 or 413 on a photo has its own sentence.
 */
function useInstallationFeedback(
  extra?: (status: number | undefined) => string | undefined,
) {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("installationConflict");
      return extra?.(status);
    },
  });
}

function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: installationQueryKeys.all });
}

export function useCreateInstallation(orderId: number) {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useInstallationFeedback((status) =>
    status === 400 ? t("installationRejected") : undefined,
  );
  return useMutationFeedback({
    mutationFn: (input: InstallationInput) =>
      createInstallation(orderId, input),
    successMessage: t("installationCreated"),
    ...feedback,
    onSettled: refresh,
  });
}

export function useStartInstallation() {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useInstallationFeedback();
  return useMutationFeedback({
    mutationFn: (id: number) => startInstallation(id),
    successMessage: t("installationStarted"),
    ...feedback,
    onSettled: refresh,
  });
}

export function useFinishInstallation() {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useInstallationFeedback();
  return useMutationFeedback({
    mutationFn: (id: number) => finishInstallation(id),
    successMessage: t("installationFinished"),
    ...feedback,
    onSettled: refresh,
  });
}

export function useUploadInstallationPhoto(id: number) {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useInstallationFeedback((status) => {
    if (status === 413) return t("installationPhotoTooLarge");
    if (status === 400) return t("installationPhotoRejected");
    return undefined;
  });
  return useMutationFeedback({
    mutationFn: (file: File) => uploadInstallationPhoto(id, file),
    successMessage: t("installationPhotoUploaded"),
    ...feedback,
    onSettled: refresh,
  });
}
