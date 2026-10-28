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

export interface OrderMaterialDetail {
  order: MaterialOrderHeader;
  demandBearing: boolean;
  items: MaterialItemRow[];
  panels: MaterialPanel[];
  unlinked: UnlinkedBomLine[];
}

export interface MaterialOrderListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
}
