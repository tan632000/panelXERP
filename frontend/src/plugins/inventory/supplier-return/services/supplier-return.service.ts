import api from "@/kernel/core/api/api";

import { supplierReturnApiRoutes } from "@plugins/inventory/supplier-return/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  SupplierReturnInput,
  SupplierReturnRow,
} from "@plugins/inventory/supplier-return/types";

export async function getSupplierReturns(params: {
  purchaseOrderId: number;
  limit?: number;
}): Promise<PaginatedResponse<SupplierReturnRow>> {
  const { data } = await api.get<PaginatedResponse<SupplierReturnRow>>(
    supplierReturnApiRoutes.list,
    { params },
  );
  return data;
}

/** 201 for a new return, 200 with the first one when the request key was posted before. */
export async function createSupplierReturn(
  payload: SupplierReturnInput,
): Promise<SupplierReturnRow> {
  const { data } = await api.post<SupplierReturnRow>(
    supplierReturnApiRoutes.list,
    payload,
  );
  return data;
}

/** The item a scanned barcode or code names; a 404 when no active item has it. */
export async function resolveScannedItemId(code: string): Promise<number> {
  const { data } = await api.get<{ id: number }>(
    supplierReturnApiRoutes.resolveItem,
    { params: { code } },
  );
  return data.id;
}
