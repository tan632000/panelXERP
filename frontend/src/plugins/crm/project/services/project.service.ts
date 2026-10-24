import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";

import { projectApiRoutes } from "@plugins/crm/project/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateProjectDto,
  Project,
  ProjectListParams,
  ProjectNextCode,
  UpdateProjectDto,
} from "@plugins/crm/project/types";

export async function getProjects(
  params: ProjectListParams = {},
): Promise<PaginatedResponse<Project>> {
  const { data } = await api.get<PaginatedResponse<Project>>(
    projectApiRoutes.list,
    { params },
  );
  return data;
}

export async function getNextProjectCode(): Promise<ProjectNextCode> {
  const { data } = await api.get<ProjectNextCode>(projectApiRoutes.nextCode);
  return data;
}

export async function createProject(
  payload: CreateProjectDto,
): Promise<Project> {
  const { data } = await api.post<Project>(projectApiRoutes.list, payload);
  return data;
}

export async function updateProject(
  id: number,
  payload: UpdateProjectDto,
): Promise<Project> {
  const { data } = await api.patch<Project>(
    projectApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function deleteProject(id: number): Promise<void> {
  await api.delete(projectApiRoutes.detail(id));
}

export function bulkDeleteProjects(ids: number[]): Promise<BulkDeleteResult> {
  return requestBulkDelete(projectApiRoutes.bulkDelete, ids);
}
