import { Decimal } from "decimal.js";

import type { PurchaseOrderLine } from "@plugins/inventory/purchase-order/types";

/** What this receipt takes of each order line, by line id, as the stored number text. */
export type ReceiveQuantities = Readonly<Record<number, string>>;

/** Why a scan adds nothing: the item is not ordered, or its lines have nothing left. */
export type ScanRefusal = "notOnOrder" | "beyondRemaining";

export class ScanRefusedError extends Error {
  constructor(readonly refusal: ScanRefusal) {
    super(refusal);
    this.name = "ScanRefusedError";
  }
}

const decimalOf = (text: string | undefined) => {
  if (!text) return new Decimal(0);
  try {
    return new Decimal(text);
  } catch {
    return new Decimal(0);
  }
};

/** Ordered minus already received, in decimal: `0.3 − 0.1` is `0.2`, never `0.19999…`. */
export function remainingOf(line: PurchaseOrderLine): Decimal {
  return new Decimal(String(line.quantity)).sub(String(line.receivedQty));
}

export function takenOf(quantities: ReceiveQuantities, lineId: number): Decimal {
  return decimalOf(quantities[lineId]);
}

/** True when this receipt takes more of the line than remains to be received. */
export function exceedsRemaining(
  line: PurchaseOrderLine,
  quantities: ReceiveQuantities,
): boolean {
  return takenOf(quantities, line.id).greaterThan(remainingOf(line));
}

/**
 * The order line a scan of `itemId` adds one to: the first line of that item with room for one
 * more. A scanned item that is not on the order, or has no room left, is refused.
 */
export function lineForScan(
  lines: readonly PurchaseOrderLine[],
  quantities: ReceiveQuantities,
  itemId: number,
): number {
  const ofItem = lines.filter((line) => line.itemId === itemId);
  if (ofItem.length === 0) throw new ScanRefusedError("notOnOrder");
  const target = ofItem.find((line) =>
    takenOf(quantities, line.id).add(1).lessThanOrEqualTo(remainingOf(line)),
  );
  if (!target) throw new ScanRefusedError("beyondRemaining");
  return target.id;
}

export function addOne(
  quantities: ReceiveQuantities,
  lineId: number,
): ReceiveQuantities {
  return { ...quantities, [lineId]: takenOf(quantities, lineId).add(1).toFixed() };
}

/** The lines this receipt posts: every line with a positive quantity, in order. */
export function receiptLines(
  lines: readonly PurchaseOrderLine[],
  quantities: ReceiveQuantities,
): Array<{ poLineId: number; quantity: number }> {
  return lines
    .filter((line) => takenOf(quantities, line.id).greaterThan(0))
    .map((line) => ({
      poLineId: line.id,
      quantity: takenOf(quantities, line.id).toNumber(),
    }));
}
