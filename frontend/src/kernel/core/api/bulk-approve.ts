import api from "@/kernel/core/api/api";

import type {
  BulkApproveId,
  BulkApproveResult,
} from "@/kernel/core/types/bulk-approve";

/** Approves the rows ticked in a list through the resource's bulk-approve endpoint. */
export async function requestBulkApprove<TId extends BulkApproveId = number>(
  endpoint: string,
  ids: TId[],
): Promise<BulkApproveResult<TId>> {
  const { data } = await api.post<BulkApproveResult<TId>>(endpoint, { ids });
  return data;
}
