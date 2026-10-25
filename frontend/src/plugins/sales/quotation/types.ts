import type {
  DiscountType,
  QuotationVersionStatus,
} from "@plugins/sales/quotation/constants";

/** The request a quotation answers, as the list and detail show it. */
export interface QuotationRequestSummary {
  id: number;
  code: string;
  title: string;
  status: string;
  customerId: number;
  customerName?: string | null;
  salesOwnerId: number;
  salesOwnerName?: string | null;
}

export interface QuotationVersionSummary {
  ver: number;
  status: QuotationVersionStatus;
  total: number;
  createdAt?: string;
}

export interface QuotationListItem {
  id: number;
  code: string;
  requestId: number;
  estimateId: number;
  latestVer: number;
  updatedAt?: string;
  request: QuotationRequestSummary | null;
  /** The latest version. */
  latest: QuotationVersionSummary | null;
}

/** A material of the panel as the customer reads it; frozen when the version was created. */
export interface QuotationBomLine {
  id: number;
  itemCode: string;
  itemName: string;
  itemBrand?: string | null;
  itemUnit: string;
  quantity: number;
}

export interface QuotationCostLine {
  id: number;
  category: string;
  description?: string | null;
}

/** One estimate panel with its margin and price. */
export interface QuotationLine {
  id: number;
  tag: string;
  description?: string | null;
  quantity: number;
  /** Cost of one panel, from the estimate. */
  unitCost: number;
  marginPercent: number;
  unitPrice: number;
  amount: number;
  bomLines: QuotationBomLine[];
  costLines: QuotationCostLine[];
}

export interface QuotationVersion {
  id: number;
  quotationId: number;
  ver: number;
  status: QuotationVersionStatus;
  estimateRevisionId: number;
  estimateRevision: number;
  discountType: DiscountType;
  discountValue: number;
  vatRate: number;
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatAmount: number;
  total: number;
  createdBy?: number | null;
  createdAt?: string;
  lines: QuotationLine[];
}

/** A quotation with the version asked for (the latest by default) and the version list. */
export interface QuotationDetail extends Omit<
  QuotationListItem,
  "request" | "latest"
> {
  request: QuotationRequestSummary;
  versions: QuotationVersionSummary[];
  current: QuotationVersion;
}

export interface QuotationListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuotationVersionStatus;
  code?: string;
  customerId?: number;
  requestId?: number;
}

export interface CreateQuotationDto {
  requestId: number;
  estimateRevisionId?: number;
}

export interface UpdateQuotationPricingDto {
  lines?: Array<{ lineId: number; marginPercent: number }>;
  discountType?: DiscountType;
  discountValue?: number;
  vatRate?: number;
}
