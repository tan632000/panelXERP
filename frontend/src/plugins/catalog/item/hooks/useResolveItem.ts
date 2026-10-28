"use client";

import {
  getItem,
  resolveItemCode,
} from "@plugins/catalog/item/services/item.service";

import type { Item } from "@plugins/catalog/item/types";

/**
 * Turns a scanned barcode or item code into the full item. The scan lookup answers only
 * identity, so the item is read once more for the form that opens on it. A plain function,
 * not a mutation: `ScanInput` owns the ordering of overlapping scans.
 */
export function resolveScannedItem(code: string): Promise<Item> {
  return resolveItemCode(code).then(({ id }) => getItem(id));
}

export function useResolveItem() {
  return resolveScannedItem;
}
