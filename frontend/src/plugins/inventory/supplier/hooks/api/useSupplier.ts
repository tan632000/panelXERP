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

import { supplierQueryKeys } from "@plugins/inventory/supplier/constants";
import {
  bulkDeleteSuppliers,
  createSupplier,
  deleteSupplier,
  getSuppliers,
  updateSupplier,
} from "@plugins/inventory/supplier/services/supplier.service";
import { resolveSupplierDeleteToastKey } from "@plugins/inventory/supplier/utils/map-supplier-api-errors";

import type {
  CreateSupplierDto,
  SupplierListParams,
  UpdateSupplierDto,
} from "@plugins/inventory/supplier/types";

export function useSupplierList(params: SupplierListParams = {}) {
  return useQuery({
    queryKey: supplierQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getSuppliers(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreateSupplier() {
  const t = useTranslations("supplier.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("supplier.toast");
  return useMutationFeedback({
    mutationFn: (input: CreateSupplierDto) => createSupplier(input),
    successMessage: t("createSupplierSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supplierQueryKeys.all });
    },
  });
}

export function useUpdateSupplier() {
  const t = useTranslations("supplier.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("supplier.toast");
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateSupplierDto }) =>
      updateSupplier(id, data),
    successMessage: t("updateSupplierSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supplierQueryKeys.all });
    },
  });
}

export function useDeleteSupplier() {
  const t = useTranslations("supplier.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("supplier.toast");
  return useMutationFeedback({
    mutationFn: (id: number) => deleteSupplier(id),
    successMessage: t("deleteSupplierSuccess"),
    ...feedback,
    resolveErrorMessage: (error) => {
      const resolved = feedback.resolveErrorMessage?.(error);
      if (resolved) return resolved;
      const toastKey = resolveSupplierDeleteToastKey(error);
      return toastKey ? t(toastKey) : undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supplierQueryKeys.all });
    },
  });
}

/** Deletes the rows ticked in the list; refused rows stay, reported by count. */
export function useBulkDeleteSuppliers(options?: BulkDeleteHookOptions) {
  return useBulkDeleteMutation({
    mutationFn: bulkDeleteSuppliers,
    toastNamespace: "supplier.toast",
    invalidateQueryKey: supplierQueryKeys.all,
    ...options,
  });
}
