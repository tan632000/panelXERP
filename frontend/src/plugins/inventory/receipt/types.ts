/** One receipt as listed: quantities only, never a price. */
export interface ReceiptRow {
  id: number;
  code: string;
  purchaseOrderId: number;
  purchaseOrderCode: string;
  supplierName: string;
  note: string | null;
  lineCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
}

/** `unitCost` is present only for an actor holding `purchase_price:read`. */
export interface ReceiptLine {
  id: number;
  poLineId: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitCost?: number;
}

export interface ReceiptDetail extends ReceiptRow {
  lines: ReceiptLine[];
}

export interface ReceiptListParams {
  page?: number;
  limit?: number;
  search?: string;
  purchaseOrderId?: number;
}

export interface ReceiptInput {
  purchaseOrderId: number;
  /** One key per receive screen: a repeated post answers the first receipt. */
  requestKey: string;
  note?: string | null;
  lines: Array<{ poLineId: number; quantity: number }>;
}
