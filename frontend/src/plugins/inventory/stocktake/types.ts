import type { StocktakeStatus } from "@plugins/inventory/stocktake/constants";

export interface StocktakeRow {
  id: number;
  code: string;
  scope: "all" | "location";
  locationId: number | null;
  locationCode: string | null;
  status: StocktakeStatus;
  note: string | null;
  lineCount: number;
  countedCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
}

/**
 * The book quantity and the difference reach every reader; `unitCost` and `value` only an
 * actor holding `purchase_price:read`, once the count is approved.
 */
export interface StocktakeLine {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  countedQty: number | null;
  bookQty: number | null;
  diff: number | null;
  countedAt: string | null;
  unitCost?: number | null;
  value?: number | null;
}

export interface StocktakeDetail extends StocktakeRow {
  rejectReason: string | null;
  cancelReason: string | null;
  submittedBy: number | null;
  approvedBy: number | null;
  /** The creator, every submitter and every counter: none of them may approve or reject. */
  involvedUserIds: number[];
  lines: StocktakeLine[];
}

export interface StocktakeInput {
  scope: "all" | "location";
  locationId?: number;
}

export interface LocationOption {
  id: number;
  code: string;
  name: string;
}
