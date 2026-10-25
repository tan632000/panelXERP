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
  total: number;
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
  unitCost: number;
  amount: number;
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
  unitCost: number;
  /** `unitCost × quantity`. */
  total: number;
  bomLines: EstimateBomLine[];
  costLines: EstimateCostLine[];
}

export interface EstimateRevision {
  id: number;
  estimateId: number;
  revision: number;
  status: RevisionStatus;
  total: number;
  submittedAt?: string | null;
  submittedBy?: number | null;
  createdAt?: string;
  panels: EstimatePanel[];
}

export interface EstimateRevisionSummary {
  revision: number;
  status: RevisionStatus;
  total: number;
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
  unitCost?: number;
  note?: string | null;
}
/** The item of a line is fixed. */
export type UpdateBomLineDto = Partial<Omit<CreateBomLineDto, "itemId">>;

export interface CreateCostLineDto {
  category: CostCategory;
  description?: string | null;
  amount: number;
}
export type UpdateCostLineDto = Partial<CreateCostLineDto>;
