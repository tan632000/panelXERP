export interface Project {
  id: number;
  code: string;
  customerId: number;
  customerCode?: string | null;
  customerName?: string | null;
  name: string;
  siteAddress?: string | null;
  note?: string | null;
  quotationTemplateId?: number | null;
  quotationTemplateName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
}

export interface CreateProjectDto {
  code: string;
  customerId: number;
  name: string;
  siteAddress?: string;
  note?: string;
  /** Quotation template of the project; `null` clears it. Absent leaves it unchanged. */
  quotationTemplateId?: number | null;
}

/** A project never moves to another customer, so `customerId` is not updatable. */
export type UpdateProjectDto = Partial<Omit<CreateProjectDto, "customerId">>;

export interface ProjectNextCode {
  code: string;
}
