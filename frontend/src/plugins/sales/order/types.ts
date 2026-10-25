import type { OrderStatus } from "@plugins/sales/order/constants";

export interface OrderListItem {
  id: number;
  code: string;
  status: OrderStatus;
  quotationId: number;
  quotationVer: number;
  requestId: number;
  customerId: number;
  customerName: string;
  projectName?: string | null;
  contractNo?: string | null;
  deliveryDate?: string | null;
  total: number;
  createdAt?: string;
  request: { id: number; code: string } | null;
}

/** A material of an order line, copied from the quotation's frozen BOM. */
export interface OrderBomLine {
  id: number;
  itemCode: string;
  itemName: string;
  itemBrand?: string | null;
  itemUnit: string;
  quantity: number;
}

export interface OrderLine {
  id: number;
  tag: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  bomLines: OrderBomLine[];
}

/** The documents the order came from, for the chain breadcrumb. */
export interface OrderChain {
  request: { id: number; code: string; title: string; status: string };
  estimate: { id: number; code: string; revision: number };
  quotation: { id: number; code: string; ver: number };
}

export interface OrderDetail extends Omit<OrderListItem, "request"> {
  estimateId: number;
  estimateRevision: number;
  customerTaxCode?: string | null;
  customerAddress?: string | null;
  projectId?: number | null;
  /** `YYYY-MM-DD`. */
  contractDate?: string | null;
  terms: string[];
  cancelReason?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatRate: number;
  vatAmount: number;
  lines: OrderLine[];
  chain: OrderChain;
}

export interface OrderListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  code?: string;
  customerId?: number;
  quotationId?: number;
}

/** The optional contract fields of a conversion; `null` clears one on an edit. */
export interface OrderHeaderDto {
  contractNo?: string | null;
  contractDate?: string | null;
  deliveryDate?: string | null;
}

export interface CreateOrderDto extends OrderHeaderDto {
  quotationId: number;
}
