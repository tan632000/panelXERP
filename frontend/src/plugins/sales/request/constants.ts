/** Request statuses in lifecycle order; values match the API enum. */
export const REQUEST_STATUSES = [
  "draft",
  "assigned",
  "estimating",
  "estimated",
  "quoted",
  "won",
  "lost",
  "cancelled",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Fields of the request stay editable only in these statuses. */
export const REQUEST_EDITABLE_STATUSES: readonly RequestStatus[] = [
  "draft",
  "assigned",
];
/** An engineer can still be given or changed in these statuses. */
export const REQUEST_ASSIGNABLE_STATUSES: readonly RequestStatus[] = [
  "draft",
  "assigned",
  "estimating",
];
export const REQUEST_CANCELLABLE_STATUSES: readonly RequestStatus[] = [
  "draft",
  "assigned",
  "estimating",
  "estimated",
];
export const REQUEST_LOSABLE_STATUSES: readonly RequestStatus[] = [
  "estimated",
  "quoted",
];
/** Files can be added or removed in these statuses. */
export const REQUEST_ATTACHMENT_OPEN_STATUSES: readonly RequestStatus[] = [
  "draft",
  "assigned",
  "estimating",
];

/** File extensions the server accepts as attachments; it also checks the content. */
export const ATTACHMENT_EXTENSIONS = [
  "pdf",
  "dwg",
  "dxf",
  "xlsx",
  "png",
  "jpg",
  "jpeg",
] as const;
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 20;

export const REQUEST_TITLE_MAX = 255;
export const REQUEST_REQUIREMENTS_MAX = 10000;
export const REQUEST_REASON_MAX = 1000;
/** Largest page the project and contact selects ask for. */
export const REQUEST_PICKER_LIMIT = 100;

export const requestPageRoutes = {
  list: "/sales/requests",
  detail: (id: number | string) => `/sales/requests/${id}`,
} as const;

export const requestApiRoutes = {
  list: "/sales/requests",
  columnValues: "/sales/requests/column-values",
  engineerOptions: "/sales/requests/engineer-options",
  detail: (id: number | string) => `/sales/requests/${id}`,
  activities: (id: number | string) => `/sales/requests/${id}/activities`,
  assign: (id: number | string) => `/sales/requests/${id}/assign`,
  cancel: (id: number | string) => `/sales/requests/${id}/cancel`,
  lost: (id: number | string) => `/sales/requests/${id}/lost`,
  attachments: (id: number | string) => `/sales/requests/${id}/attachments`,
  attachment: (id: number | string, attachmentId: number | string) =>
    `/sales/requests/${id}/attachments/${attachmentId}`,
} as const;

/** Module key the list-preference endpoint stores the request list column choice under. */
export const REQUEST_LIST_PREFERENCE_KEY = "request_list_v2";

export const requestQueryKeys = {
  all: ["sales-requests"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...requestQueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...requestQueryKeys.all, id] as const,
  activities: (id: number | string) =>
    [...requestQueryKeys.all, id, "activities"] as const,
  attachments: (id: number | string) =>
    [...requestQueryKeys.all, id, "attachments"] as const,
  engineerOptions: () => [...requestQueryKeys.all, "engineer-options"] as const,
  customerProjects: (customerId: number | string) =>
    [...requestQueryKeys.all, "customer-projects", customerId] as const,
};
