import type { RequestStatus } from "@plugins/sales/request/constants";

export interface RequestListItem {
  id: number;
  code: string;
  title: string;
  status: RequestStatus;
  customerId: number;
  customerCode?: string | null;
  customerName?: string | null;
  salesOwnerId: number;
  salesOwnerName?: string | null;
  assignedEngineerId?: number | null;
  assignedEngineerName?: string | null;
  requestedDeliveryDate?: string | null;
  quotationDueDate?: string | null;
  createdAt?: string;
}

export interface RequestCustomerSummary {
  id: number;
  code: string;
  name: string;
  taxCode?: string | null;
  address?: string | null;
}

export interface RequestProjectSummary {
  id: number;
  code: string;
  name: string;
  siteAddress?: string | null;
}

export interface RequestContactSummary {
  id: number;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** A request as its detail page reads it, the customer, project and contact embedded. */
export interface RequestDetail extends RequestListItem {
  projectId?: number | null;
  contactId?: number | null;
  technicalRequirements?: string | null;
  cancelReason?: string | null;
  lostReason?: string | null;
  customer: RequestCustomerSummary | null;
  project: RequestProjectSummary | null;
  contact: RequestContactSummary | null;
  updatedAt?: string;
}

export interface RequestListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
  status?: RequestStatus;
  assignedEngineerId?: number;
  quotationDueFrom?: string;
  quotationDueTo?: string;
}

export interface CreateRequestDto {
  customerId: number;
  projectId?: number | null;
  contactId?: number | null;
  title: string;
  technicalRequirements?: string | null;
  requestedDeliveryDate?: string | null;
  quotationDueDate?: string | null;
}

/** A request never moves to another customer, so `customerId` is not updatable. */
export type UpdateRequestDto = Partial<Omit<CreateRequestDto, "customerId">>;

export interface AssignRequestDto {
  engineerId: number;
}

export interface RequestReasonDto {
  reason: string;
}

export interface EngineerOption {
  id: number;
  fullName: string;
}

export interface RequestAttachment {
  id: number;
  requestId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy?: number | null;
  createdAt: string;
}

export interface RequestActivity {
  id: number;
  action: string;
  actorId?: number | null;
  actorName?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt: string;
}
