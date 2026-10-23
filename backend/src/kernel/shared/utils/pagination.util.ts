import {
  DEFAULT_PAGE,
  DEFAULT_PICKER_PAGE_SIZE,
  MAX_LIMIT,
} from '@shared/constants/pagination';

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface ResolvedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/**
 * Resolve page/limit with skip/take. Plugins import directly; pass defaultLimit only when
 * overriding. `maxLimit` overrides the shared cap for callers that must return more than one
 * page's worth of rows in one response (e.g. a CSV export), never for a paginated list view.
 */
export function resolvePagination(
  query: PaginationInput,
  defaultLimit: number = DEFAULT_PICKER_PAGE_SIZE,
  maxLimit: number = MAX_LIMIT,
): ResolvedPagination {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = Math.min(Math.max(query.limit ?? defaultLimit, 1), maxLimit);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function resolveSortOrder(sortOrder?: string): 'ASC' | 'DESC' {
  return sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}
