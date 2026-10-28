"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import {
  useBulkDeleteMutation,
  type BulkDeleteHookOptions,
} from "@/kernel/core/hooks/api/useBulkDeleteMutation";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { locationQueryKeys } from "@plugins/catalog/location/constants";
import {
  bulkDeleteLocations,
  createLocation,
  deleteLocation,
  getLocations,
  updateLocation,
} from "@plugins/catalog/location/services/location.service";
import { resolveLocationDeleteToastKey } from "@plugins/catalog/location/utils/map-location-api-errors";

import type {
  CreateLocationDto,
  LocationListParams,
  UpdateLocationDto,
} from "@plugins/catalog/location/types";

export function useLocationList(
  params: LocationListParams = {},
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: locationQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getLocations(params),
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
  });
}

export function useCreateLocation() {
  const t = useTranslations("location.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("location.toast");
  return useMutationFeedback({
    mutationFn: (input: CreateLocationDto) => createLocation(input),
    successMessage: t("createLocationSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationQueryKeys.all });
    },
  });
}

export function useUpdateLocation() {
  const t = useTranslations("location.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("location.toast");
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateLocationDto }) =>
      updateLocation(id, data),
    successMessage: t("updateLocationSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationQueryKeys.all });
    },
  });
}

export function useDeleteLocation() {
  const t = useTranslations("location.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("location.toast");
  return useMutationFeedback({
    mutationFn: (id: number) => deleteLocation(id),
    successMessage: t("deleteLocationSuccess"),
    ...feedback,
    resolveErrorMessage: (error) => {
      const resolved = feedback.resolveErrorMessage?.(error);
      if (resolved) return resolved;
      const toastKey = resolveLocationDeleteToastKey(error);
      return toastKey ? t(toastKey) : undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationQueryKeys.all });
    },
  });
}

/** Deletes the rows ticked in the list; refused rows stay, reported by count. */
export function useBulkDeleteLocations(options?: BulkDeleteHookOptions) {
  return useBulkDeleteMutation({
    mutationFn: bulkDeleteLocations,
    toastNamespace: "location.toast",
    invalidateQueryKey: locationQueryKeys.all,
    ...options,
  });
}
