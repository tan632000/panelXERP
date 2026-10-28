import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import { itemApiRoutes } from "@plugins/catalog/item/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateItemDto,
  Item,
  ItemImportResult,
  ItemListParams,
  UpdateItemDto,
  UpdateItemStockSettingsDto,
} from "@plugins/catalog/item/types";

export async function getItems(
  params: ItemListParams = {},
): Promise<PaginatedResponse<Item>> {
  const { data } = await api.get<PaginatedResponse<Item>>(itemApiRoutes.list, {
    params,
  });
  return data;
}

export async function createItem(payload: CreateItemDto): Promise<Item> {
  const { data } = await api.post<Item>(itemApiRoutes.list, payload);
  return data;
}

export async function updateItem(
  id: number,
  payload: UpdateItemDto,
): Promise<Item> {
  const { data } = await api.patch<Item>(itemApiRoutes.detail(id), payload);
  return data;
}

export async function updateItemStockSettings(
  id: number,
  payload: UpdateItemStockSettingsDto,
): Promise<Item> {
  const { data } = await api.patch<Item>(
    itemApiRoutes.stockSettings(id),
    payload,
  );
  return data;
}

export async function deleteItem(id: number): Promise<void> {
  await api.delete(itemApiRoutes.detail(id));
}

export function bulkDeleteItems(ids: number[]): Promise<BulkDeleteResult> {
  return requestBulkDelete(itemApiRoutes.bulkDelete, ids);
}

export async function importItems(file: File): Promise<ItemImportResult> {
  const body = new FormData();
  body.append("file", file);
  const { data } = await api.post<ItemImportResult>(
    itemApiRoutes.import,
    body,
    multipartRequestConfig(),
  );
  return data;
}

export async function fetchItemImportTemplate(): Promise<Blob> {
  const { data } = await api.get<Blob>(itemApiRoutes.importTemplate, {
    responseType: "blob",
  });
  return data;
}
