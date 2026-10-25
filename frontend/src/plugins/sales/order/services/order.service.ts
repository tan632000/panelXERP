import api from "@/kernel/core/api/api";

import { orderApiRoutes } from "@plugins/sales/order/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateOrderDto,
  OrderDetail,
  OrderHeaderDto,
  OrderListItem,
  OrderListParams,
} from "@plugins/sales/order/types";

export async function getOrders(
  params: OrderListParams = {},
): Promise<PaginatedResponse<OrderListItem>> {
  const { data } = await api.get<PaginatedResponse<OrderListItem>>(
    orderApiRoutes.list,
    { params },
  );
  return data;
}

export async function getOrder(id: number): Promise<OrderDetail> {
  const { data } = await api.get<OrderDetail>(orderApiRoutes.detail(id));
  return data;
}

/** Converts the customer-confirmed quotation into its one order. */
export async function createOrder(
  payload: CreateOrderDto,
): Promise<OrderDetail> {
  const { data } = await api.post<OrderDetail>(orderApiRoutes.list, payload);
  return data;
}

/** Only the contract number, contract date and delivery date, while the order is open. */
export async function updateOrder(
  id: number,
  payload: OrderHeaderDto,
): Promise<OrderDetail> {
  const { data } = await api.patch<OrderDetail>(
    orderApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function cancelOrder(
  id: number,
  reason: string,
): Promise<OrderDetail> {
  const { data } = await api.post<OrderDetail>(orderApiRoutes.cancel(id), {
    reason,
  });
  return data;
}
