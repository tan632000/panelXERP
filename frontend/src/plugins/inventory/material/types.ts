import type { OrderStatus } from "@plugins/sales/order/constants";

/** An order as the material view knows it: no price, total, discount or VAT, ever. */
export interface MaterialOrderHeader {
  id: number;
  code: string;
  status: OrderStatus;
  deliveryDate: string | null;
  createdAt: string;
  customerName: string;
  projectName: string | null;
  requestId: number;
  salesOwnerId: number;
  salesOwnerName: string | null;
}

export interface MaterialOrderRow extends MaterialOrderHeader {
  shortLineCount: number;
  unlinkedCount: number;
}

export interface MaterialItemRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  demand: number;
  reserved: number;
  issued: number;
  returned: number;
  short: number;
}

export interface MaterialPanel {
  lineId: number;
  tag: string;
  description: string | null;
  quantity: number;
  bomLines: Array<{
    bomLineId: number;
    itemId: number;
    itemCode: string;
    itemName: string;
    itemUnit: string;
    perPanelQuantity: number;
    demand: number;
  }>;
}

export interface UnlinkedBomLine {
  bomLineId: number;
  lineId: number;
  tag: string;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  perPanelQuantity: number;
}

/** An issue line beyond the BOM and the reason given for it. */
export interface OverBomIssue {
  movementId: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  reason: string;
  issuedAt: string;
}

export interface OrderMaterialDetail {
  order: MaterialOrderHeader;
  demandBearing: boolean;
  items: MaterialItemRow[];
  panels: MaterialPanel[];
  unlinked: UnlinkedBomLine[];
  overBomIssues: OverBomIssue[];
}

export interface MaterialOrderListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
}

/**
 * One item of an order, estimated against actual. The cost keys are present only for an actor
 * holding `purchase_price:read`; the API drops them for everyone else.
 */
export interface EstimateVsActualRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  estimatedQty: number;
  actualQty: number;
  qtyVariance: number;
  estimatedCost?: number;
  actualCost?: number;
  costVariance?: number;
}

export interface EstimateVsActualReport {
  order: MaterialOrderHeader;
  items: EstimateVsActualRow[];
  overBomIssues: Array<{
    issueCode: string;
    issuedAt: string;
    itemId: number;
    itemCode: string;
    itemName: string;
    quantity: number;
    reason: string;
    panelTag: string | null;
  }>;
  unlinked: Array<{
    bomLineId: number;
    panelTag: string;
    itemCode: string;
    itemName: string;
    perPanelQuantity: number;
  }>;
  totals?: { estimatedCost: number; actualCost: number; costVariance: number };
}
