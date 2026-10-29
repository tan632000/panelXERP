import { Decimal } from "decimal.js";

import type { PurchaseOrderLine } from "@plugins/inventory/purchase-order/types";

/** What this return sends back of each order line, by line id, as the stored number text. */
export type ReturnQuantities = Readonly<Record<number, string>>;

/** Why a scan adds nothing: the item is not on the order, or all of it received is going back. */
export type ReturnScanRefusal = "notOnOrder" | "nothingReceived";

export class ReturnScanRefusedError extends Error {
  constructor(readonly refusal: ReturnScanRefusal) {
    super(refusal);
    this.name = "ReturnScanRefusedError";
  }
}

const decimalOf = (text: string | number | undefined) => {
  try {
    return new Decimal(text === undefined || text === "" ? 0 : String(text));
  } catch {
    return new Decimal(0);
  }
};

export function takenOf(quantities: ReturnQuantities, lineId: number): Decimal {
  return decimalOf(quantities[lineId]);
}

/** More of the line going back than it has received. */
export function exceedsReceived(
  line: PurchaseOrderLine,
  quantities: ReturnQuantities,
): boolean {
  return takenOf(quantities, line.id).greaterThan(decimalOf(line.receivedQty));
}

/**
 * The order line a scan of `itemId` adds one to: the first line of that item with room for one
 * more under what it received.
 */
export function lineForReturnScan(
  lines: readonly PurchaseOrderLine[],
  quantities: ReturnQuantities,
  itemId: number,
): number {
  const ofItem = lines.filter((line) => line.itemId === itemId);
  if (ofItem.length === 0) throw new ReturnScanRefusedError("notOnOrder");
  const target = ofItem.find((line) =>
    takenOf(quantities, line.id)
      .add(1)
      .lessThanOrEqualTo(decimalOf(line.receivedQty)),
  );
  if (!target) throw new ReturnScanRefusedError("nothingReceived");
  return target.id;
}

export function addOne(
  quantities: ReturnQuantities,
  lineId: number,
): ReturnQuantities {
  return {
    ...quantities,
    [lineId]: takenOf(quantities, lineId).add(1).toFixed(),
  };
}

/** The lines this return posts: every line with a positive quantity, in order. */
export function returnLines(
  lines: readonly PurchaseOrderLine[],
  quantities: ReturnQuantities,
): Array<{ poLineId: number; quantity: number }> {
  return lines
    .filter((line) => takenOf(quantities, line.id).greaterThan(0))
    .map((line) => ({
      poLineId: line.id,
      quantity: takenOf(quantities, line.id).toNumber(),
    }));
}
