import api from "@/kernel/core/api/api";

import { issueApiRoutes } from "@plugins/production/production-issue/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  IssueListParams,
  OpenIssueInput,
  ProductionIssue,
} from "@plugins/production/production-issue/types";

export async function getIssues(
  params: IssueListParams = {},
): Promise<PaginatedResponse<ProductionIssue>> {
  const { data } = await api.get<PaginatedResponse<ProductionIssue>>(
    issueApiRoutes.list,
    { params },
  );
  return data;
}

export async function openIssue(
  unitId: number,
  input: OpenIssueInput,
): Promise<ProductionIssue> {
  const { data } = await api.post<ProductionIssue>(
    issueApiRoutes.open(unitId),
    input,
  );
  return data;
}

export async function resolveIssue(
  id: number,
  resolution: string,
): Promise<ProductionIssue> {
  const { data } = await api.post<ProductionIssue>(issueApiRoutes.resolve(id), {
    resolution,
  });
  return data;
}
