import api from "@/kernel/core/api/api";

import { issueApiRoutes } from "@plugins/inventory/issue/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  IssueInput,
  OrderStockDocumentListParams,
  OrderStockDocumentRow,
  ResolvedScanItem,
  WorkshopReturnInput,
} from "@plugins/inventory/issue/types";

export async function getIssues(
  params: OrderStockDocumentListParams = {},
): Promise<PaginatedResponse<OrderStockDocumentRow>> {
  const { data } = await api.get<PaginatedResponse<OrderStockDocumentRow>>(
    issueApiRoutes.issues,
    { params },
  );
  return data;
}

/** 201 for a new issue, 200 with the first one when the request key was posted before. */
export async function createIssue(
  payload: IssueInput,
): Promise<OrderStockDocumentRow> {
  const { data } = await api.post<OrderStockDocumentRow>(
    issueApiRoutes.issues,
    payload,
  );
  return data;
}

export async function createWorkshopReturn(
  payload: WorkshopReturnInput,
): Promise<OrderStockDocumentRow> {
  const { data } = await api.post<OrderStockDocumentRow>(
    issueApiRoutes.workshopReturns,
    payload,
  );
  return data;
}

/** The item a scanned barcode or code names; a 404 when no active item has it. */
export async function resolveScannedItem(
  code: string,
): Promise<ResolvedScanItem> {
  const { data } = await api.get<ResolvedScanItem>(issueApiRoutes.resolveItem, {
    params: { code },
  });
  return data;
}
