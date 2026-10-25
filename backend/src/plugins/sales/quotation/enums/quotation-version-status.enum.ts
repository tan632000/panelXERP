/**
 * Where one version of a quotation stands. Only a `draft` is editable; revising closes the
 * version it replaces.
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

/** The states a version may be cancelled from, and in which the request's close cancels it. */
export const QUOTATION_OPEN_STATUSES: readonly QuotationVersionStatus[] = [
  QuotationVersionStatus.DRAFT,
  QuotationVersionStatus.PENDING_APPROVAL,
  QuotationVersionStatus.APPROVED,
  QuotationVersionStatus.REJECTED,
];

/** Only a version the company has approved may be shown to the customer. */
export const QUOTATION_EXPORTABLE_STATUSES: readonly QuotationVersionStatus[] =
  [QuotationVersionStatus.APPROVED, QuotationVersionStatus.CUSTOMER_CONFIRMED];
