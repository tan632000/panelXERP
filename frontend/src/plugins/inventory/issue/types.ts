/** One issue or workshop return as listed: quantities only, never a cost. */
export interface OrderStockDocumentRow {
  id: number;
  code: string;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  note: string | null;
  lineCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
}

export interface OrderStockDocumentListParams {
  page?: number;
  limit?: number;
  search?: string;
  orderId?: number;
}

export interface IssueInput {
  orderId: number;
  /** One key per screen: a repeated post answers the first document. */
  requestKey: string;
  lines: Array<{
    itemId: number;
    orderLineId?: number;
    quantity: number;
    reason?: string;
  }>;
}

export interface WorkshopReturnInput {
  orderId: number;
  requestKey: string;
  lines: Array<{ itemId: number; quantity: number }>;
}

/** The scan lookup's answer: the item's identity. */
export interface ResolvedScanItem {
  id: number;
  code: string;
  name: string;
  unit: string;
}
