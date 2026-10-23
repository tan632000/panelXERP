import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";

import { customerApiRoutes } from "@plugins/crm/customer/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateCustomerDto,
  Customer,
  CustomerListParams,
  CustomerNextCode,
  CustomerOwnerOption,
  UpdateCustomerDto,
} from "@plugins/crm/customer/types";

export async function getCustomers(
  params: CustomerListParams = {},
): Promise<PaginatedResponse<Customer>> {
  const { data } = await api.get<PaginatedResponse<Customer>>(
    customerApiRoutes.list,
    { params },
  );
  return data;
}

export async function getCustomer(id: number): Promise<Customer> {
  const { data } = await api.get<Customer>(customerApiRoutes.detail(id));
  return data;
}

export async function getNextCustomerCode(): Promise<CustomerNextCode> {
  const { data } = await api.get<CustomerNextCode>(customerApiRoutes.nextCode);
  return data;
}

export async function getCustomerOwnerOptions(): Promise<
  CustomerOwnerOption[]
> {
  const { data } = await api.get<CustomerOwnerOption[]>(
    customerApiRoutes.ownerOptions,
  );
  return data;
}

export async function createCustomer(
  payload: CreateCustomerDto,
): Promise<Customer> {
  const { data } = await api.post<Customer>(customerApiRoutes.list, payload);
  return data;
}

export async function updateCustomer(
  id: number,
  payload: UpdateCustomerDto,
): Promise<Customer> {
  const { data } = await api.patch<Customer>(
    customerApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function deleteCustomer(id: number): Promise<void> {
  await api.delete(customerApiRoutes.detail(id));
}

export function bulkDeleteCustomers(ids: number[]): Promise<BulkDeleteResult> {
  return requestBulkDelete(customerApiRoutes.bulkDelete, ids);
}
