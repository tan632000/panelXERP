import api from "@/kernel/core/api/api";

import { qcChecklistApiRoutes } from "@plugins/delivery/qc-checklist/constants";

import type {
  QcChecklistItem,
  UpdateQcChecklistItemInput,
} from "@plugins/delivery/qc-checklist/types";

export async function getChecklistItems(
  includeHidden: boolean,
): Promise<QcChecklistItem[]> {
  const { data } = await api.get<QcChecklistItem[]>(qcChecklistApiRoutes.list, {
    params: { includeHidden },
  });
  return data;
}

export async function addChecklistItem(name: string): Promise<QcChecklistItem> {
  const { data } = await api.post<QcChecklistItem>(qcChecklistApiRoutes.list, {
    name,
  });
  return data;
}

export async function updateChecklistItem(
  id: number,
  input: UpdateQcChecklistItemInput,
): Promise<QcChecklistItem> {
  const { data } = await api.patch<QcChecklistItem>(
    qcChecklistApiRoutes.item(id),
    input,
  );
  return data;
}

/** `ids` is every item, hidden ones included, in the new order. */
export async function reorderChecklistItems(
  ids: number[],
): Promise<QcChecklistItem[]> {
  const { data } = await api.put<QcChecklistItem[]>(
    qcChecklistApiRoutes.order,
    { ids },
  );
  return data;
}
