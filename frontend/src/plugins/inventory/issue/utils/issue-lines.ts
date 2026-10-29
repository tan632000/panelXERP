import { Decimal } from "decimal.js";

import type {
  MaterialItemRow,
  MaterialPanel,
} from "@plugins/inventory/material/types";

/**
 * One line being issued: an item, for one panel of the order or outside the BOM, the quantity
 * as the stored number text and the reason given when the order goes beyond its BOM.
 */
export interface IssueDraftLine {
  key: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  /** The panel line; null for a line outside the BOM. */
  orderLineId: number | null;
  quantity: string;
  reason: string;
}

export interface ScannedItem {
  id: number;
  code: string;
  name: string;
  unit: string;
}

const decimalOf = (text: string | number | undefined) => {
  try {
    return new Decimal(text === undefined || text === "" ? 0 : String(text));
  } catch {
    return new Decimal(0);
  }
};

const keyOf = (orderLineId: number | null, itemId: number) =>
  `${orderLineId ?? "outside"}:${itemId}`;

/**
 * Adds one of the scanned item: to the selected panel's line of that item when the panel's BOM
 * holds it, otherwise to a line outside the BOM.
 */
export function addScanned(
  lines: readonly IssueDraftLine[],
  panel: MaterialPanel | null,
  item: ScannedItem,
): IssueDraftLine[] {
  const onPanel = panel?.bomLines.some((bom) => bom.itemId === item.id);
  const orderLineId = onPanel && panel ? panel.lineId : null;
  const key = keyOf(orderLineId, item.id);
  const existing = lines.find((line) => line.key === key);
  if (existing) {
    return lines.map((line) =>
      line.key === key
        ? { ...line, quantity: decimalOf(line.quantity).add(1).toFixed() }
        : line,
    );
  }
  return [
    ...lines,
    {
      key,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      itemUnit: item.unit,
      orderLineId,
      quantity: "1",
      reason: "",
    },
  ];
}

/**
 * Items this document takes beyond the order's BOM: what the order already has out plus what
 * is being issued now, above its demand (an item not on the BOM has a demand of 0). Every line
 * of such an item needs a reason, as the server will ask.
 */
export function overBomItemIds(
  lines: readonly IssueDraftLine[],
  items: readonly MaterialItemRow[],
): Set<number> {
  const taken = new Map<number, Decimal>();
  for (const line of lines) {
    taken.set(
      line.itemId,
      (taken.get(line.itemId) ?? new Decimal(0)).add(decimalOf(line.quantity)),
    );
  }
  const over = new Set<number>();
  for (const [itemId, quantity] of taken) {
    const row = items.find((item) => item.itemId === itemId);
    const out = row
      ? decimalOf(row.issued).sub(decimalOf(row.returned))
      : new Decimal(0);
    const demand = row ? decimalOf(row.demand) : new Decimal(0);
    if (out.add(quantity).greaterThan(demand)) over.add(itemId);
  }
  return over;
}

/** True when a line beyond the BOM still lacks its reason. */
export function needsReason(line: IssueDraftLine, over: Set<number>): boolean {
  return over.has(line.itemId) && line.reason.trim() === "";
}

/** What the workshop still has of the item for this order: issued less returned. */
export function outAtWorkshop(item: MaterialItemRow): Decimal {
  return decimalOf(item.issued).sub(decimalOf(item.returned));
}

export function quantityOf(text: string | undefined): Decimal {
  return decimalOf(text);
}
