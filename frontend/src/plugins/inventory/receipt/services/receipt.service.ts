import api from "@/kernel/core/api/api";

import { receiptApiRoutes } from "@plugins/inventory/receipt/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  ReceiptDetail,
  ReceiptInput,
  ReceiptListParams,
  ReceiptRow,
} from "@plugins/inventory/receipt/types";

export async function getReceipts(
  params: ReceiptListParams = {},
): Promise<PaginatedResponse<ReceiptRow>> {
  const { data } = await api.get<PaginatedResponse<ReceiptRow>>(
    receiptApiRoutes.list,
    { params },
  );
  return data;
}

/** 201 for a new receipt, 200 with the first one when the request key was posted before. */
export async function createReceipt(
  payload: ReceiptInput,
): Promise<ReceiptDetail> {
  const { data } = await api.post<ReceiptDetail>(
    receiptApiRoutes.list,
    payload,
  );
  return data;
}

/** The item a scanned barcode or code names; a 404 when no active item has it. */
export async function resolveScannedItemId(code: string): Promise<number> {
  const { data } = await api.get<{ id: number }>(receiptApiRoutes.resolveItem, {
    params: { code },
  });
  return data.id;
}
