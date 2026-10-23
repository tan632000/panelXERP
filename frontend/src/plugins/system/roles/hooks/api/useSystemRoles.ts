"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { systemRoleQueryKeys } from "@plugins/system/roles/constants";
import {
  getPermissionCatalog,
  getSystemRoles,
  updateRolePermissions,
} from "@plugins/system/roles/services/system-role.service";

const TOAST_NAMESPACE = "system.roles.toast";

export function useSystemRoleList() {
  return useQuery({
    queryKey: systemRoleQueryKeys.list(),
    queryFn: getSystemRoles,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: systemRoleQueryKeys.catalog(),
    queryFn: getPermissionCatalog,
    enabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useUpdateRolePermissions() {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE);
  return useMutationFeedback({
    mutationFn: ({ id, permissions }: { id: number; permissions: string[] }) =>
      updateRolePermissions(id, permissions),
    successMessage: t("updateSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: systemRoleQueryKeys.all });
    },
  });
}
