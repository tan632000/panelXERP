export interface Location {
  id: number;
  code: string;
  name: string;
  note?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocationListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
}

export interface CreateLocationDto {
  code: string;
  name: string;
  note?: string;
  isActive?: boolean;
}

export type UpdateLocationDto = Partial<CreateLocationDto>;
