export interface Supplier {
  id: number;
  code: string;
  name: string;
  taxCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  note?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
}

export interface CreateSupplierDto {
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  note?: string;
  isActive?: boolean;
}

export type UpdateSupplierDto = Partial<CreateSupplierDto>;
