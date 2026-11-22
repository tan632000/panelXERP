/** Keep in sync with the backend `DeliveryNoteStatus`. */
export const DELIVERY_NOTE_STATUSES = [
  "draft",
  "shipped",
  "received",
  "cancelled",
] as const;
export type DeliveryNoteStatus = (typeof DELIVERY_NOTE_STATUSES)[number];

/** Where a cabinet stands on delivery: on no live note, or on a note in this status. */
export type UnitDeliveryStatus = "none" | Exclude<DeliveryNoteStatus, "cancelled">;

/** Longest note, address and cancel reason the server takes. */
export const DELIVERY_NOTE_TEXT_MAX = 1000;
export const DELIVERY_ADDRESS_MAX = 500;
export const RECEIVER_NAME_MAX = 255;

/** Handover minutes: 1 to 5 files of these types, as the server repeats the check. */
export const RECEIPT_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg";
export const RECEIPT_FILE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"] as const;
export const RECEIPT_FILE_MAX_COUNT = 5;
export const RECEIPT_FILE_MAX_BYTES = 20 * 1024 * 1024;

export const deliveryNotePageRoutes = {
  list: "/delivery/notes",
  create: "/delivery/notes/new",
  detail: (id: number | string) => `/delivery/notes/${id}`,
  order: (orderId: number | string) => `/delivery/orders/${orderId}`,
} as const;

export const deliveryNoteApiRoutes = {
  deliverable: "/delivery/orders/deliverable",
  order: (orderId: number | string) => `/delivery/orders/${orderId}`,
  notes: "/delivery/notes",
  note: (id: number | string) => `/delivery/notes/${id}`,
  ship: (id: number | string) => `/delivery/notes/${id}/ship`,
  receive: (id: number | string) => `/delivery/notes/${id}/receive`,
  cancel: (id: number | string) => `/delivery/notes/${id}/cancel`,
  fileContent: (id: number | string, fileId: number | string) =>
    `/delivery/notes/${id}/files/${fileId}/content`,
} as const;

export const deliveryNoteQueryKeys = {
  all: ["delivery-note"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...deliveryNoteQueryKeys.all, "list", filters] as const,
  detail: (id: number) => [...deliveryNoteQueryKeys.all, "detail", id] as const,
  deliverable: () => [...deliveryNoteQueryKeys.all, "deliverable"] as const,
  order: (orderId: number) =>
    [...deliveryNoteQueryKeys.all, "order", orderId] as const,
};
