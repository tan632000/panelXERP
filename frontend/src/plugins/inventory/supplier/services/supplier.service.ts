import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";

import { supplierApiRoutes } from "@plugins/inventory/supplier/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateSupplierDto,
  Supplier,
  SupplierListParams,
  UpdateSupplierDto,
} from "@plugins/inventory/supplier/types";

export async function getSuppliers(
  params: SupplierListParams = {},
): Promise<PaginatedResponse<Supplier>> {
  const { data } = await api.get<PaginatedResponse<Supplier>>(
    supplierApiRoutes.list,
    { params },
  );
  return data;
}

export async function createSupplier(
  payload: CreateSupplierDto,
): Promise<Supplier> {
  const { data } = await api.post<Supplier>(supplierApiRoutes.list, payload);
  return data;
}

export async function updateSupplier(
  id: number,
  payload: UpdateSupplierDto,
): Promise<Supplier> {
  const { data } = await api.patch<Supplier>(
    supplierApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function deleteSupplier(id: number): Promise<void> {
  await api.delete(supplierApiRoutes.detail(id));
}

export function bulkDeleteSuppliers(ids: number[]): Promise<BulkDeleteResult> {
  return requestBulkDelete(supplierApiRoutes.bulkDelete, ids);
}
