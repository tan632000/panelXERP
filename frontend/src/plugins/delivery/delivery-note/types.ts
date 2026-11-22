import type {
  DeliveryNoteStatus,
  UnitDeliveryStatus,
} from "@plugins/delivery/delivery-note/constants";
import type { QcUnitStatus } from "@plugins/delivery/qc-inspection/constants";

/** A note as a list shows it. The server sends no price and no storage key. */
export interface DeliveryNoteSummary {
  id: number;
  code: string;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  projectName: string | null;
  status: DeliveryNoteStatus;
  plannedDate: string | null;
  deliveryAddress: string | null;
  note: string | null;
  unitCount: number;
  shippedAt: string | null;
  receivedDate: string | null;
  receiverName: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface DeliveryNoteFile {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DeliveryNoteDetail extends DeliveryNoteSummary {
  units: Array<{ unitId: number; code: string }>;
  files: DeliveryNoteFile[];
}

export interface DeliverableOrder {
  orderId: number;
  code: string;
  customerName: string;
  projectName: string | null;
}

export interface DeliveryOrderUnit {
  unitId: number;
  code: string;
  tag: string;
  description: string | null;
  qcStatus: QcUnitStatus;
  deliveryStatus: UnitDeliveryStatus;
  deliveryNoteCode: string | null;
}

export interface DeliveryOrderDetail extends DeliverableOrder {
  status: string;
  /** Prefill of a new note's address: the project site, else the customer address. */
  siteAddress: string | null;
  units: DeliveryOrderUnit[];
  notes: DeliveryNoteSummary[];
}

export interface DeliveryNoteListParams {
  status?: DeliveryNoteStatus;
  orderId?: number;
  page?: number;
  limit?: number;
}

export interface DeliveryNoteInput {
  orderId: number;
  unitIds: number[];
  plannedDate?: string;
  deliveryAddress?: string;
  note?: string;
}

export interface ReceiveInput {
  receiverName: string;
  receivedDate: string;
  files: File[];
}
