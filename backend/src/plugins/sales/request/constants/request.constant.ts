/** Document code prefix — codes read `YC_2027_0001`. */
export const REQUEST_CODE_PREFIX = 'YC';

/** Physical table and the unique index over its code, named for the retry on a lost race. */
export const REQUEST_TABLE = 'sales_requests';
export const REQUEST_CODE_UNIQUE_INDEX = 'uq_sales_requests_code';

/** Roles whose accounts may be assigned to estimate a request. */
export const REQUEST_ENGINEER_ROLE_CODES = [
  'engineer',
  'engineeringLead',
] as const;

/** Notification raised for the engineer a request is assigned to. */
export const REQUEST_ASSIGNED_EVENT = 'sales.request.assigned';

/** Most files one request carries, and the size of one file. */
export const MAX_ATTACHMENTS_PER_REQUEST = 20;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
