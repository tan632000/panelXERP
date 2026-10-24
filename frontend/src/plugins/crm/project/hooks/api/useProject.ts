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

import { projectQueryKeys } from "@plugins/crm/project/constants";
import {
  bulkDeleteProjects,
  createProject,
  deleteProject,
  getNextProjectCode,
  getProjects,
  updateProject,
} from "@plugins/crm/project/services/project.service";
import { resolveProjectDeleteToastKey } from "@plugins/crm/project/utils/map-project-api-errors";

import type {
  CreateProjectDto,
  ProjectListParams,
  UpdateProjectDto,
} from "@plugins/crm/project/types";

export function useProjectList(params: ProjectListParams = {}) {
  return useQuery({
    queryKey: projectQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getProjects(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useNextProjectCode(enabled = true) {
  return useQuery({
    queryKey: projectQueryKeys.nextCode(),
    queryFn: getNextProjectCode,
    enabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreateProject() {
  const t = useTranslations("project.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("project.toast");
  return useMutationFeedback({
    mutationFn: (input: CreateProjectDto) => createProject(input),
    successMessage: t("createProjectSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectQueryKeys.all });
    },
  });
}

export function useUpdateProject() {
  const t = useTranslations("project.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("project.toast");
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateProjectDto }) =>
      updateProject(id, data),
    successMessage: t("updateProjectSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectQueryKeys.all });
    },
  });
}

export function useDeleteProject() {
  const t = useTranslations("project.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("project.toast");
  return useMutationFeedback({
    mutationFn: (id: number) => deleteProject(id),
    successMessage: t("deleteProjectSuccess"),
    ...feedback,
    resolveErrorMessage: (error) => {
      const resolved = feedback.resolveErrorMessage?.(error);
      if (resolved) return resolved;
      const toastKey = resolveProjectDeleteToastKey(error);
      return toastKey ? t(toastKey) : undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectQueryKeys.all });
    },
  });
}

/** Deletes the rows ticked in the list; refused rows stay, reported by count. */
export function useBulkDeleteProjects(options?: BulkDeleteHookOptions) {
  return useBulkDeleteMutation({
    mutationFn: bulkDeleteProjects,
    toastNamespace: "project.toast",
    invalidateQueryKey: projectQueryKeys.all,
    ...options,
  });
}
