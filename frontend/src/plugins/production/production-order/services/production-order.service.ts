import api from "@/kernel/core/api/api";

import { productionOrderApiRoutes } from "@plugins/production/production-order/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  OpenOrderOption,
  ProductionOrderDetail,
  ProductionOrderListParams,
  ProductionOrderRow,
  ProductionShortItem,
  TechnicianOption,
  UnitUpdateInput,
} from "@plugins/production/production-order/types";

export async function getProductionOrders(
  params: ProductionOrderListParams = {},
): Promise<PaginatedResponse<ProductionOrderRow>> {
  const { data } = await api.get<PaginatedResponse<ProductionOrderRow>>(
    productionOrderApiRoutes.list,
    { params },
  );
  return data;
}

export async function getProductionOrder(
  id: number,
): Promise<ProductionOrderDetail> {
  const { data } = await api.get<ProductionOrderDetail>(
    productionOrderApiRoutes.detail(id),
  );
  return data;
}

export async function getProductionShortage(
  id: number,
): Promise<ProductionShortItem[]> {
  const { data } = await api.get<ProductionShortItem[]>(
    productionOrderApiRoutes.shortage(id),
  );
  return data;
}

export async function createProductionOrder(
  orderId: number,
): Promise<ProductionOrderDetail> {
  const { data } = await api.post<ProductionOrderDetail>(
    productionOrderApiRoutes.list,
    { orderId },
  );
  return data;
}

export async function updateProductionUnit(
  id: number,
  unitId: number,
  input: UnitUpdateInput,
): Promise<ProductionOrderDetail> {
  const { data } = await api.patch<ProductionOrderDetail>(
    productionOrderApiRoutes.unit(id, unitId),
    input,
  );
  return data;
}

export async function releaseProductionOrder(
  id: number,
): Promise<ProductionOrderDetail> {
  const { data } = await api.post<ProductionOrderDetail>(
    productionOrderApiRoutes.release(id),
    {},
  );
  return data;
}

export async function cancelProductionOrder(
  id: number,
  reason: string,
): Promise<ProductionOrderDetail> {
  const { data } = await api.post<ProductionOrderDetail>(
    productionOrderApiRoutes.cancel(id),
    { reason },
  );
  return data;
}

export async function getTechnicianOptions(): Promise<TechnicianOption[]> {
  const { data } = await api.get<TechnicianOption[]>(
    productionOrderApiRoutes.technicianOptions,
  );
  return data;
}

export async function getOpenOrders(
  search?: string,
): Promise<OpenOrderOption[]> {
  const { data } = await api.get<OpenOrderOption[]>(
    productionOrderApiRoutes.openOrders,
    { params: search ? { search } : {} },
  );
  return data;
}
