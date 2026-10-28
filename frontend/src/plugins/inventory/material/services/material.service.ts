import api from "@/kernel/core/api/api";

import { materialApiRoutes } from "@plugins/inventory/material/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  MaterialOrderListParams,
  MaterialOrderRow,
  OrderMaterialDetail,
} from "@plugins/inventory/material/types";

export async function getMaterialOrders(
  params: MaterialOrderListParams = {},
): Promise<PaginatedResponse<MaterialOrderRow>> {
  const { data } = await api.get<PaginatedResponse<MaterialOrderRow>>(
    materialApiRoutes.orders,
    { params },
  );
  return data;
}

export async function getOrderMaterial(
  orderId: number,
): Promise<OrderMaterialDetail> {
  const { data } = await api.get<OrderMaterialDetail>(
    materialApiRoutes.order(orderId),
  );
  return data;
}
