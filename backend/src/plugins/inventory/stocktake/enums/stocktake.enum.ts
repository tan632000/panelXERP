export enum StocktakeStatus {
  COUNTING = 'counting',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  CANCELLED = 'cancelled',
}

export enum StocktakeScope {
  ALL = 'all',
  LOCATION = 'location',
}

/** Statuses a count is open in: only one count may be (D-14). */
export const STOCKTAKE_OPEN: readonly StocktakeStatus[] = [
  StocktakeStatus.COUNTING,
  StocktakeStatus.SUBMITTED,
];
