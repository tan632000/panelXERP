import type {
  CostCategory,
  EstimateListStatus,
  RevisionStatus,
} from "@plugins/sales/estimate/constants";

/** The request an estimate answers, as the list and detail show it. */
export interface EstimateRequestSummary {
  id: number;
  code: string;
  title: string;
  status: string;
  customerName?: string | null;
  salesOwnerId: number;
  salesOwnerName?: string | null;
  assignedEngineerId?: number | null;
  assignedEngineerName?: string | null;
}

export interface EstimateListItem {
  id: number;
  code: string;
  requestId: number;
  status: EstimateListStatus;
  latestRevision: number;
  /** When sales completed the pricing of the latest revision; null while it awaits pricing. */
  latestPricedAt?: string | null;
  /** Absent for an actor without `reference_price:read`; so is every money field below. */
  total?: number;
  updatedAt?: string;
  request: EstimateRequestSummary | null;
}

export interface EstimateBomLine {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemBrand?: string | null;
  itemUnit: string;
  quantity: number;
  unitCost?: number;
  amount?: number;
  note?: string | null;
}

export interface EstimateCostLine {
  id: number;
  category: CostCategory;
  description?: string | null;
  /** The cost of ONE panel. */
  amount: number;
}

export interface EstimatePanel {
  id: number;
  tag: string;
  description?: string | null;
  quantity: number;
  /** Cost of one panel. */
  unitCost?: number;
  /** `unitCost × quantity`. */
  total?: number;
  bomLines: EstimateBomLine[];
  /** The whole array is absent without `reference_price:read`. */
  costLines?: EstimateCostLine[];
}

export interface EstimateRevision {
  id: number;
  estimateId: number;
  revision: number;
  status: RevisionStatus;
  total?: number;
  submittedAt?: string | null;
  submittedBy?: number | null;
  /** Set once sales completes the pricing; a submitted revision without it awaits pricing. */
  pricedAt?: string | null;
  pricedBy?: number | null;
  createdAt?: string;
  panels: EstimatePanel[];
}

export interface EstimateRevisionSummary {
  revision: number;
  status: RevisionStatus;
  total?: number;
  submittedAt?: string | null;
}

/** An estimate with the revision asked for (the latest by default) and the revision list. */
export interface EstimateDetail extends Omit<EstimateListItem, "request"> {
  request: EstimateRequestSummary;
  revisions: EstimateRevisionSummary[];
  current: EstimateRevision;
}

export interface EstimateListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EstimateListStatus;
  requestId?: number;
  assignedEngineerId?: number;
}

export interface CreatePanelDto {
  tag: string;
  description?: string | null;
  quantity: number;
}
export type UpdatePanelDto = Partial<CreatePanelDto>;

export interface CreateBomLineDto {
  itemId: number;
  quantity: number;
  note?: string | null;
}
/** The item of a line is fixed. */
export type UpdateBomLineDto = Partial<Omit<CreateBomLineDto, "itemId">>;

/** The unit cost sales sets on a BOM line while the submitted revision awaits pricing. */
export interface PriceBomLineDto {
  unitCost: number;
}

export interface CreateCostLineDto {
  category: CostCategory;
  description?: string | null;
  amount: number;
}
export type UpdateCostLineDto = Partial<CreateCostLineDto>;
