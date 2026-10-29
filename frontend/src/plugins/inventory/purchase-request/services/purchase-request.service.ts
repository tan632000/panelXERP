import api from "@/kernel/core/api/api";

import { purchaseRequestApiRoutes } from "@plugins/inventory/purchase-request/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  PurchaseRequest,
  PurchaseRequestInput,
  SupplierOption,
} from "@plugins/inventory/purchase-request/types";

export async function getPurchaseRequests(
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<PaginatedResponse<PurchaseRequest>> {
  const { data } = await api.get<PaginatedResponse<PurchaseRequest>>(
    purchaseRequestApiRoutes.list,
    { params },
  );
  return data;
}

export async function createPurchaseRequest(
  payload: PurchaseRequestInput,
): Promise<PurchaseRequest> {
  const { data } = await api.post<PurchaseRequest>(
    purchaseRequestApiRoutes.list,
    payload,
  );
  return data;
}

/** A request for what the order is still short of; 409 when nothing is left to request. */
export async function requestFromOrder(orderId: number): Promise<PurchaseRequest> {
  const { data } = await api.post<PurchaseRequest>(
    purchaseRequestApiRoutes.fromOrder(orderId),
  );
  return data;
}

export async function cancelPurchaseRequest(
  id: number,
  reason: string,
): Promise<PurchaseRequest> {
  const { data } = await api.post<PurchaseRequest>(
    purchaseRequestApiRoutes.cancel(id),
    { reason },
  );
  return data;
}

/** A draft purchase order for one supplier from the chosen request lines. */
export async function orderRequestLines(payload: {
  supplierId: number;
  lines: Array<{ prLineId: number; quantity: number }>;
}): Promise<{ id: number; code: string }> {
  const { data } = await api.post<{ id: number; code: string }>(
    purchaseRequestApiRoutes.toPurchaseOrder,
    payload,
  );
  return data;
}

export async function getSuppliers(): Promise<SupplierOption[]> {
  const { data } = await api.get<{ data: SupplierOption[] }>(
    purchaseRequestApiRoutes.suppliers,
    { params: { limit: 200 } },
  );
  return data.data;
}

/** The item a typed or scanned code names; a 404 when no active item has it. */
export async function resolveItem(
  code: string,
): Promise<{ id: number; code: string; name: string; unit: string }> {
  const { data } = await api.get<{
    id: number;
    code: string;
    name: string;
    unit: string;
  }>(purchaseRequestApiRoutes.resolveItem, { params: { code } });
  return data;
}
