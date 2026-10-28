/** What the order's history records; edits of a draft are tracked in `editor_ids` instead. */
export enum PurchaseOrderEventType {
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
}
