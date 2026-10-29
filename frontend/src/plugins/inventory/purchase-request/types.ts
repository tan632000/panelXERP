/** One requested item with what purchase orders have taken of it (D-11). */
export interface PurchaseRequestLine {
  id: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  neededBy: string | null;
  note: string | null;
  sourceOrderId: number | null;
  sourceOrderCode: string | null;
  ordered: number;
  remaining: number;
}

export interface PurchaseRequest {
  id: number;
  code: string;
  status: "cancelled" | "ordered" | "open";
  note: string | null;
  cancelReason: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  lines: PurchaseRequestLine[];
}

export interface PurchaseRequestInput {
  note?: string | null;
  lines: Array<{ itemId: number; quantity: number }>;
}

export interface SupplierOption {
  id: number;
  code: string;
  name: string;
}
