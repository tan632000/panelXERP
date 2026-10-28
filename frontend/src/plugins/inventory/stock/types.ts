/**
 * One item's stock. `avgCost` and `value` are present only for an actor holding
 * `purchase_price:read`; the API drops the keys for everyone else.
 */
export interface StockRow {
  itemId: number;
  code: string;
  name: string;
  unit: string;
  defaultLocationId: number | null;
  locationCode: string | null;
  locationName: string | null;
  onHand: number;
  reserved: number;
  available: number;
  minStock: number | null;
  low: boolean;
  avgCost?: number | null;
  value?: number;
}

export type StockMovementType =
  | "receipt"
  | "issue"
  | "workshop_return"
  | "supplier_return"
  | "count_adjustment";

/** One ledger row; the cost keys follow the same rule as `StockRow`. */
export interface StockMovement {
  id: string;
  movementType: StockMovementType;
  quantity: number;
  onHandAfter: number;
  documentType: string;
  documentId: number;
  orderId: number | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
  unitCost?: number;
  value?: number;
  avgCostAfter?: number;
}

export interface StockListParams {
  page?: number;
  limit?: number;
  search?: string;
  lowOnly?: boolean;
  locationId?: number;
}
