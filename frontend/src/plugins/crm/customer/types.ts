export interface Customer {
  id: number;
  code: string;
  name: string;
  taxCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  salesOwnerId: number;
  salesOwnerName?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
}

export interface CreateCustomerDto {
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  salesOwnerId?: number;
  note?: string;
}

export type UpdateCustomerDto = Partial<CreateCustomerDto>;

export interface CustomerNextCode {
  code: string;
}

export interface CustomerOwnerOption {
  id: number;
  fullName: string;
}
