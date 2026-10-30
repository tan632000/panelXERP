import type { PurchaseOrderStatus } from "@plugins/inventory/purchase-order/constants";

/**
 * One order as listed. `vatRate`, `subtotal`, `vatAmount` and `total` are present only for an
 * actor holding `purchase_price:read`; the API drops the keys for everyone else.
 */
export interface PurchaseOrderRow {
  id: number;
  code: string;
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  expectedDate: string | null;
  vatRate?: number;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  note: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
}

/** `unitPrice` and `amount` follow the same rule as the header's money. */
export interface PurchaseOrderLine {
  id: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitPrice?: number;
  amount?: number;
  receivedQty: number;
  /** Raised from a purchase request: its item and quantity are fixed, only the price moves. */
  fromRequest?: boolean;
}

export type PurchaseOrderEventType =
  "submitted" | "approved" | "rejected" | "cancelled" | "closed";

export interface PurchaseOrderEvent {
  id: number;
  event: PurchaseOrderEventType;
  actorId: number;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  editorIds: number[];
  submittedBy: number | null;
  approvedBy: number | null;
  cancelReason: string | null;
  closeReason: string | null;
  lines: PurchaseOrderLine[];
  events: PurchaseOrderEvent[];
}

export interface PurchaseOrderListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: PurchaseOrderStatus;
}

export interface PurchaseOrderLineInput {
  itemId: number;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseOrderInput {
  supplierId: number;
  expectedDate?: string | null;
  vatRate: number;
  note?: string | null;
  lines: PurchaseOrderLineInput[];
}
