/**
 * Where one version of a quotation stands. Only a `draft` is editable; revising closes the
 * version it replaces. The approval and customer-answer states are reached by later steps of
 * the workflow.
 */
export enum QuotationVersionStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CUSTOMER_CONFIRMED = 'customer_confirmed',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
}

/** The states a version may be revised from: it was handed in and not yet answered for good. */
export const QUOTATION_REVISABLE_STATUSES: readonly QuotationVersionStatus[] = [
  QuotationVersionStatus.PENDING_APPROVAL,
  QuotationVersionStatus.APPROVED,
  QuotationVersionStatus.REJECTED,
];
