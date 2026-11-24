import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";
import { MAX_PAGE_SIZE } from "@/kernel/core/constants/list-ui";

import { projectApiRoutes } from "@plugins/crm/project/constants";
import { templateApiRoutes } from "@plugins/sales/template/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateProjectDto,
  Project,
  ProjectListParams,
  ProjectNextCode,
  UpdateProjectDto,
} from "@plugins/crm/project/types";
import type { QuotationTemplate } from "@plugins/sales/template/types";

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

/**
 * The active quotation templates a project may pick. One request: the template list is a
 * handful of masters, so a list past the page cap is not expected.
 */
export async function getActiveQuotationTemplates(): Promise<
  QuotationTemplate[]
> {
  const { data } = await api.get<PaginatedResponse<QuotationTemplate>>(
    templateApiRoutes.list,
    { params: { isActive: true, limit: MAX_PAGE_SIZE } },
  );
  return data.data;
}
