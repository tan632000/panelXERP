import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

/**
 * The only moves a request makes, one step at a time. `lost` and `cancelled` are final, and
 * `won` ends only when its order is cancelled (`won → lost`): the request's own close and the
 * quotation's cancel refuse a won request before they reach this table. Cancelling needs the
 * request not yet quoted; losing needs an estimate or a quote.
 */
export const REQUEST_STATUS_TRANSITIONS: Readonly<
  Record<RequestStatus, readonly RequestStatus[]>
> = {
  [RequestStatus.DRAFT]: [RequestStatus.ASSIGNED, RequestStatus.CANCELLED],
  [RequestStatus.ASSIGNED]: [RequestStatus.ESTIMATING, RequestStatus.CANCELLED],
  [RequestStatus.ESTIMATING]: [
    RequestStatus.ESTIMATED,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.ESTIMATED]: [
    RequestStatus.QUOTED,
    RequestStatus.LOST,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.QUOTED]: [RequestStatus.WON, RequestStatus.LOST],
  [RequestStatus.WON]: [RequestStatus.LOST],
  [RequestStatus.LOST]: [],
  [RequestStatus.CANCELLED]: [],
};

/** States in which the request's own fields may still be edited. */
export const REQUEST_EDITABLE_STATUSES: readonly RequestStatus[] = [
  RequestStatus.DRAFT,
  RequestStatus.ASSIGNED,
];

/** States in which an engineer may be (re)assigned: the work has not been handed in yet. */
export const REQUEST_ASSIGNABLE_STATUSES: readonly RequestStatus[] = [
  RequestStatus.DRAFT,
  RequestStatus.ASSIGNED,
  RequestStatus.ESTIMATING,
];

/** States in which drawings and specs may still be added or removed. */
export const REQUEST_ATTACHMENT_OPEN_STATUSES: readonly RequestStatus[] = [
  RequestStatus.DRAFT,
  RequestStatus.ASSIGNED,
  RequestStatus.ESTIMATING,
];
