"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { requestBulkApprove } from "@/kernel/core/api/bulk-approve";
import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import {
  useBulkApproveMutation,
  type BulkApproveHookOptions,
} from "@/kernel/core/hooks/api/useBulkApproveMutation";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import {
  adminUserApiRoutes,
  adminUserQueryKeys,
} from "@plugins/system/users/constants";
import {
  approveAdminUserSignature,
  bulkDeactivateAdminUsers,
  bulkDeleteAdminUsers,
  createAdminUser,
  deleteAdminUser,
  getAdminUser,
  getAdminUsers,
  getAssignableRoles,
  importAdminUsers,
  rejectAdminUserSignature,
  setAdminUserActive,
  updateAdminUser,
} from "@plugins/system/users/services/admin-user.service";

import type {
  AdminUserListParams,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from "@plugins/system/users/types";

const TOAST_NAMESPACE = "system.users.toast";

export function useAdminUserList(params: AdminUserListParams = {}) {
  return useQuery({
    queryKey: adminUserQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getAdminUsers(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** One account, for a review opened from a notification rather than from a list row. */
export function useAdminUser(id: number | null) {
  return useQuery({
    queryKey: adminUserQueryKeys.detail(id ?? 0),
    queryFn: () => getAdminUser(id as number),
    enabled: id !== null,
  });
}

export function useApproveAdminUserSignature() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: (id: number) => approveAdminUserSignature(id),
    successMessage: t("signatureApproved"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

/** Approves the waiting signature of each ticked account. */
export function useBulkApproveAdminUserSignatures(
  options?: BulkApproveHookOptions,
) {
  return useBulkApproveMutation({
    mutationFn: (ids) =>
      requestBulkApprove(adminUserApiRoutes.bulkApproveSignatures, ids),
    toastNamespace: TOAST_NAMESPACE,
    invalidateQueryKey: adminUserQueryKeys.all,
    ...options,
  });
}

export function useRejectAdminUserSignature() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      rejectAdminUserSignature(id, reason),
    successMessage: t("signatureRejected"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

export function useAssignableRoles() {
  return useQuery({
    queryKey: adminUserQueryKeys.roles(),
    queryFn: getAssignableRoles,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreateAdminUser() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: (input: CreateAdminUserDto) => createAdminUser(input),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

export function useUpdateAdminUser() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateAdminUserDto }) =>
      updateAdminUser(id, data),
    successMessage: t("updateSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

export function useSetAdminUserActive() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      setAdminUserActive(id, isActive),
    successMessage: (user) =>
      user.isActive ? t("activateSuccess") : t("deactivateSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

export function useBulkDeactivateAdminUsers({
  onDeactivated,
}: {
  /** Unticks the rows the batch actually changed, leaving a refused one selected. */
  onDeactivated?: (ids: number[]) => void;
} = {}) {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: (ids: number[]) => bulkDeactivateAdminUsers(ids),
    successMessage: (result) =>
      t("bulkDeactivateSuccess", { count: result.deleted.length }),
    ...feedback,
    onSuccess: (result) => {
      onDeactivated?.(result.deleted as number[]);
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

export function useDeleteAdminUser() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: (id: number) => deleteAdminUser(id),
    successMessage: t("deleteSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

export function useBulkDeleteAdminUsers({
  onDeleted,
}: {
  /** Unticks the rows the batch actually removed, leaving a refused one selected. */
  onDeleted?: (ids: number[]) => void;
} = {}) {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: (ids: number[]) => bulkDeleteAdminUsers(ids),
    successMessage: (result) =>
      t("bulkDeleteSuccess", { count: result.deleted.length }),
    ...feedback,
    onSuccess: (result) => {
      onDeleted?.(result.deleted as number[]);
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}

/**
 * Plain `useMutation`, not `useMutationFeedback`: a rejected file is reported row by row in
 * the import modal, so a toast on top would only repeat it less precisely.
 */
export function useImportAdminUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importAdminUsers,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminUserQueryKeys.all });
    },
  });
}
