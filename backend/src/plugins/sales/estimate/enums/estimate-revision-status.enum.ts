/**
 * Where one revision of an estimate stands. A revision is editable only as a draft; once
 * submitted it is read-only, and it becomes superseded when its successor is submitted.
 */
export enum EstimateRevisionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  SUPERSEDED = 'superseded',
}
