export const ALL_FILTER_VALUE = "all";

export function omitAllFilter(
  value: string | undefined | null,
): string | undefined {
  if (!value || value === ALL_FILTER_VALUE) {
    return undefined;
  }
  return value;
}

export function omitEmptySearch(
  search: string | undefined | null,
): string | undefined {
  const trimmed = search?.trim();
  return trimmed || undefined;
}

export function resolveListEmptyMessage(
  hasActiveFilters: boolean,
  messages: { empty: string; notFound: string },
): string {
  return hasActiveFilters ? messages.notFound : messages.empty;
}
