import api from "@/kernel/core/api/api";

import { purchaseOrderApiRoutes } from "@plugins/inventory/purchase-order/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type { PurchaseOrderAction } from "@plugins/inventory/purchase-order/constants";
import type {
  PurchaseOrderDetail,
  PurchaseOrderInput,
  PurchaseOrderListParams,
  PurchaseOrderRow,
} from "@plugins/inventory/purchase-order/types";

export async function getPurchaseOrders(
  params: PurchaseOrderListParams = {},
): Promise<PaginatedResponse<PurchaseOrderRow>> {
  const { data } = await api.get<PaginatedResponse<PurchaseOrderRow>>(
    purchaseOrderApiRoutes.list,
    { params },
  );
  return data;
}

export async function getPurchaseOrder(
  id: number,
): Promise<PurchaseOrderDetail> {
  const { data } = await api.get<PurchaseOrderDetail>(
    purchaseOrderApiRoutes.detail(id),
  );
  return data;
}

export async function createPurchaseOrder(
  payload: PurchaseOrderInput,
): Promise<PurchaseOrderDetail> {
  const { data } = await api.post<PurchaseOrderDetail>(
    purchaseOrderApiRoutes.list,
    payload,
  );
  return data;
}

export async function updatePurchaseOrder(
  id: number,
  payload: Partial<PurchaseOrderInput>,
): Promise<PurchaseOrderDetail> {
  const { data } = await api.patch<PurchaseOrderDetail>(
    purchaseOrderApiRoutes.detail(id),
    payload,
  );
  return data;
}

/** Submit and approve take no body; reject, cancel and close carry their reason. */
export async function runPurchaseOrderAction(
  id: number,
  action: PurchaseOrderAction,
  reason?: string,
): Promise<PurchaseOrderDetail> {
  const { data } = await api.post<PurchaseOrderDetail>(
    purchaseOrderApiRoutes.action(id, action),
    reason === undefined ? {} : { reason },
  );
  return data;
}
