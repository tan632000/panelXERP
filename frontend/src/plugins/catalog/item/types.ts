import type { ItemGroup } from "@plugins/catalog/item/constants";

export interface Item {
  id: number;
  code: string;
  name: string;
  specification?: string | null;
  brand?: string | null;
  group: ItemGroup;
  unit: string;
  /** Absent from the response unless the actor holds `reference_price:read`. */
  referencePrice?: number | null;
  note?: string | null;
  barcode?: string | null;
  defaultLocationId?: number | null;
  /** Sent by the list only; the detail and write responses carry just the id. */
  defaultLocation?: { id: number; code: string; name: string } | null;
  minStock?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
}

export interface CreateItemDto {
  code: string;
  name: string;
  specification?: string;
  brand?: string;
  group: ItemGroup;
  unit: string;
  referencePrice?: number;
  note?: string;
}

/** The code is immutable, so it is never part of an update. */
export type UpdateItemDto = Partial<
  Omit<CreateItemDto, "code" | "referencePrice">
> & { referencePrice?: number | null };

/** A field left out stays as it is; `null` (or an empty barcode) clears it. */
export interface UpdateItemStockSettingsDto {
  barcode?: string | null;
  defaultLocationId?: number | null;
  minStock?: number | null;
}

/** One rejected sheet row; `row` is the 1-based sheet row including the header. */
export interface ItemImportRowError {
  row: number;
  field: string;
  reason: string;
}

export interface ItemImportResult {
  created: number;
  errors: ItemImportRowError[];
}
