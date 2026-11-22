export const DELIVERY_NOTE_TABLE = 'delivery_notes';
export const DELIVERY_NOTE_CODE_PREFIX = 'PGH';
export const DELIVERY_NOTE_CODE_INDEX = 'uq_delivery_notes_code';

/** Name the delivery note guards register under on the production guard registry. */
export const DELIVERY_NOTE_GUARD_NAME = 'delivery-note';

export const DELIVERY_NOTE_TEXT_MAX = 1000;
export const DELIVERY_ADDRESS_MAX = 500;
export const RECEIVER_NAME_MAX = 255;

/** `draft → shipped → received`, or `cancelled` from draft or shipped. */
export enum DeliveryNoteStatus {
  DRAFT = 'draft',
  SHIPPED = 'shipped',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

/** Where a cabinet stands on delivery: on no live note, or on a note in this status. */
export type UnitDeliveryStatus =
  | 'none'
  | DeliveryNoteStatus.DRAFT
  | DeliveryNoteStatus.SHIPPED
  | DeliveryNoteStatus.RECEIVED;
