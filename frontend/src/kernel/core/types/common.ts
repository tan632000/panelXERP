export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totalLines?: number;
  /** Distinct document count behind a flat line list (e.g. request slips). */
  totalDocs?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}
