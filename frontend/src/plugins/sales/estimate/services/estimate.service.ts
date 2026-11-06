import api from "@/kernel/core/api/api";

import { estimateApiRoutes } from "@plugins/sales/estimate/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateBomLineDto,
  CreateCostLineDto,
  CreatePanelDto,
  EstimateDetail,
  EstimateListItem,
  EstimateListParams,
  EstimateRevision,
  PriceBomLineDto,
  UpdateBomLineDto,
  UpdateCostLineDto,
  UpdatePanelDto,
} from "@plugins/sales/estimate/types";

export async function getEstimates(
  params: EstimateListParams = {},
): Promise<PaginatedResponse<EstimateListItem>> {
  const { data } = await api.get<PaginatedResponse<EstimateListItem>>(
    estimateApiRoutes.list,
    { params },
  );
  return data;
}

export async function getEstimate(
  id: number,
  revision?: number,
): Promise<EstimateDetail> {
  const { data } = await api.get<EstimateDetail>(estimateApiRoutes.detail(id), {
    params: revision ? { revision } : undefined,
  });
  return data;
}

export async function createEstimate(
  requestId: number,
): Promise<EstimateDetail> {
  const { data } = await api.post<EstimateDetail>(estimateApiRoutes.list, {
    requestId,
  });
  return data;
}

export async function submitEstimate(id: number): Promise<EstimateDetail> {
  const { data } = await api.post<EstimateDetail>(estimateApiRoutes.submit(id));
  return data;
}

export async function reviseEstimate(id: number): Promise<EstimateDetail> {
  const { data } = await api.post<EstimateDetail>(estimateApiRoutes.revise(id));
  return data;
}

/** Every edit answers with the whole draft revision as the server now computes it. */
export async function addPanel(
  id: number,
  payload: CreatePanelDto,
): Promise<EstimateRevision> {
  const { data } = await api.post<EstimateRevision>(
    estimateApiRoutes.panels(id),
    payload,
  );
  return data;
}

export async function updatePanel(
  id: number,
  panelId: number,
  payload: UpdatePanelDto,
): Promise<EstimateRevision> {
  const { data } = await api.patch<EstimateRevision>(
    estimateApiRoutes.panel(id, panelId),
    payload,
  );
  return data;
}

export async function deletePanel(
  id: number,
  panelId: number,
): Promise<EstimateRevision> {
  const { data } = await api.delete<EstimateRevision>(
    estimateApiRoutes.panel(id, panelId),
  );
  return data;
}

export async function addBomLine(
  id: number,
  panelId: number,
  payload: CreateBomLineDto,
): Promise<EstimateRevision> {
  const { data } = await api.post<EstimateRevision>(
    estimateApiRoutes.bomLines(id, panelId),
    payload,
  );
  return data;
}

export async function updateBomLine(
  id: number,
  lineId: number,
  payload: UpdateBomLineDto,
): Promise<EstimateRevision> {
  const { data } = await api.patch<EstimateRevision>(
    estimateApiRoutes.bomLine(id, lineId),
    payload,
  );
  return data;
}

export async function setBomLineUnitCost(
  id: number,
  lineId: number,
  payload: PriceBomLineDto,
): Promise<EstimateRevision> {
  const { data } = await api.patch<EstimateRevision>(
    estimateApiRoutes.unitCost(id, lineId),
    payload,
  );
  return data;
}

export async function completeEstimatePricing(
  id: number,
): Promise<EstimateRevision> {
  const { data } = await api.post<EstimateRevision>(
    estimateApiRoutes.price(id),
  );
  return data;
}

export async function deleteBomLine(
  id: number,
  lineId: number,
): Promise<EstimateRevision> {
  const { data } = await api.delete<EstimateRevision>(
    estimateApiRoutes.bomLine(id, lineId),
  );
  return data;
}

export async function addCostLine(
  id: number,
  panelId: number,
  payload: CreateCostLineDto,
): Promise<EstimateRevision> {
  const { data } = await api.post<EstimateRevision>(
    estimateApiRoutes.costLines(id, panelId),
    payload,
  );
  return data;
}

export async function updateCostLine(
  id: number,
  lineId: number,
  payload: UpdateCostLineDto,
): Promise<EstimateRevision> {
  const { data } = await api.patch<EstimateRevision>(
    estimateApiRoutes.costLine(id, lineId),
    payload,
  );
  return data;
}

export async function deleteCostLine(
  id: number,
  lineId: number,
): Promise<EstimateRevision> {
  const { data } = await api.delete<EstimateRevision>(
    estimateApiRoutes.costLine(id, lineId),
  );
  return data;
}
