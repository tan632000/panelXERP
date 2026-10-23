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

import { customerQueryKeys } from "@plugins/crm/customer/constants";
import {
  bulkDeleteCustomers,
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerOwnerOptions,
  getCustomers,
  getNextCustomerCode,
  updateCustomer,
} from "@plugins/crm/customer/services/customer.service";
import { resolveCustomerDeleteToastKey } from "@plugins/crm/customer/utils/map-customer-api-errors";

import type {
  CreateCustomerDto,
  CustomerListParams,
  UpdateCustomerDto,
} from "@plugins/crm/customer/types";

export function useCustomerList(params: CustomerListParams = {}) {
  return useQuery({
    queryKey: customerQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getCustomers(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCustomer(id?: number | null) {
  return useQuery({
    queryKey: customerQueryKeys.detail(id ?? 0),
    queryFn: () => getCustomer(id as number),
    enabled: Boolean(id),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useNextCustomerCode(enabled = true) {
  return useQuery({
    queryKey: customerQueryKeys.nextCode(),
    queryFn: getNextCustomerCode,
    enabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** The accounts the form may name as owner; a Sales actor gets only themselves. */
export function useCustomerOwnerOptions(enabled = true) {
  return useQuery({
    queryKey: customerQueryKeys.ownerOptions(),
    queryFn: getCustomerOwnerOptions,
    enabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreateCustomer() {
  const t = useTranslations("customer.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("customer.toast");
  return useMutationFeedback({
    mutationFn: (input: CreateCustomerDto) => createCustomer(input),
    successMessage: t("createCustomerSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerQueryKeys.all });
    },
  });
}

export function useUpdateCustomer() {
  const t = useTranslations("customer.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("customer.toast");
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateCustomerDto }) =>
      updateCustomer(id, data),
    successMessage: t("updateCustomerSuccess"),
    ...feedback,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: customerQueryKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: customerQueryKeys.all });
    },
  });
}

export function useDeleteCustomer() {
  const t = useTranslations("customer.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("customer.toast");
  return useMutationFeedback({
    mutationFn: (id: number) => deleteCustomer(id),
    successMessage: t("deleteCustomerSuccess"),
    ...feedback,
    resolveErrorMessage: (error) => {
      const resolved = feedback.resolveErrorMessage?.(error);
      if (resolved) return resolved;
      const toastKey = resolveCustomerDeleteToastKey(error);
      return toastKey ? t(toastKey) : undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerQueryKeys.all });
    },
  });
}

/** Deletes the rows ticked in the list; refused rows stay, reported by count. */
export function useBulkDeleteCustomers(options?: BulkDeleteHookOptions) {
  return useBulkDeleteMutation({
    mutationFn: bulkDeleteCustomers,
    toastNamespace: "customer.toast",
    invalidateQueryKey: customerQueryKeys.all,
    ...options,
  });
}
