/** One supplier return as listed: no price, cost or value. */
export interface SupplierReturnRow {
  id: number;
  code: string;
  purchaseOrderId: number;
  purchaseOrderCode: string;
  supplierName: string;
  reason: string;
  lineCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
}

export interface SupplierReturnInput {
  purchaseOrderId: number;
  /** One key per return screen: a repeated post answers the first return. */
  requestKey: string;
  reason: string;
  lines: Array<{ poLineId: number; quantity: number }>;
}
