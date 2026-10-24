/** Where a quote request stands; moves forward only (see `request-status-transitions`). */
export enum RequestStatus {
  DRAFT = 'draft',
  ASSIGNED = 'assigned',
  ESTIMATING = 'estimating',
  ESTIMATED = 'estimated',
  QUOTED = 'quoted',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled',
}
