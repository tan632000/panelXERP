/**
 * Delivery note permission keys — keep in sync with backend delivery-note.permissions.ts.
 */
export const DeliveryNotePermission = {
  read: "delivery_note:read",
  create: "delivery_note:create",
  ship: "delivery_note:ship",
  receive: "delivery_note:receive",
  cancel: "delivery_note:cancel",
} as const;
