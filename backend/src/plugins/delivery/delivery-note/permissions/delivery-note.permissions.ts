export const DELIVERY_NOTE_READ = 'delivery_note:read' as const;
/** Create a delivery note from QC-passed cabinets: storekeepers. */
export const DELIVERY_NOTE_CREATE = 'delivery_note:create' as const;
export const DELIVERY_NOTE_SHIP = 'delivery_note:ship' as const;
/** Record the customer receipt with the handover minutes. */
export const DELIVERY_NOTE_RECEIVE = 'delivery_note:receive' as const;
export const DELIVERY_NOTE_CANCEL = 'delivery_note:cancel' as const;

export const deliveryNotePermissions = [
  DELIVERY_NOTE_READ,
  DELIVERY_NOTE_CREATE,
  DELIVERY_NOTE_SHIP,
  DELIVERY_NOTE_RECEIVE,
  DELIVERY_NOTE_CANCEL,
] as const;
