import api from "@/kernel/core/api/api";

import type {
  BulkDeleteId,
  BulkDeleteResult,
} from "@/kernel/core/types/bulk-delete";

/**
 * Deletes the rows ticked in a list through the resource's bulk-delete endpoint.
 *
 * It is a POST because the ids travel in a body, which a DELETE is not guaranteed to carry.
 */
export async function requestBulkDelete<TId extends BulkDeleteId = number>(
  endpoint: string,
  ids: TId[],
): Promise<BulkDeleteResult<TId>> {
  const { data } = await api.post<BulkDeleteResult<TId>>(endpoint, { ids });
  return data;
}
