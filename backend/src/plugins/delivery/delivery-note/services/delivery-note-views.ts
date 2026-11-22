import type {
  DeliveryNoteStatus,
  UnitDeliveryStatus,
} from '@plugins/delivery/delivery-note/constants/delivery-note.constant';
import type { QcUnitStatus } from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import type { EntityManager } from 'typeorm';

export type RawRow = Record<string, unknown>;

/** A note as a list shows it. No price and no storage key anywhere. */
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
  shippedAt: Date | null;
  receivedDate: string | null;
  receiverName: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface DeliveryNoteFileView {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface DeliveryNoteDetail extends DeliveryNoteSummary {
  units: Array<{ unitId: number; code: string }>;
  files: DeliveryNoteFileView[];
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

export const NOTE_SELECT = `
  SELECT n.id, n.code, n.order_id, n.status, n.planned_date::text AS planned_date,
         n.delivery_address, n.note, n.shipped_at, n.received_date::text AS received_date,
         n.receiver_name, n.cancel_reason, n.cancelled_at, n.created_at,
         (SELECT COUNT(*) FROM delivery_note_units du
           WHERE du.note_id = n.id AND du.is_deleted = false) AS unit_count
    FROM delivery_notes n`;

export const FILE_SELECT = `
  SELECT f.id, f.file_name, f.content_type, f.size_bytes, f.created_at
    FROM delivery_note_files f`;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const dateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : null;

export function toNoteSummary(
  row: RawRow,
  order?: {
    code: string;
    customerName: string;
    projectName: string | null;
  } | null,
): DeliveryNoteSummary {
  return {
    id: Number(row.id),
    code: String(row.code),
    orderId: Number(row.order_id),
    orderCode: order?.code ?? null,
    customerName: order?.customerName ?? null,
    projectName: order?.projectName ?? null,
    status: row.status as DeliveryNoteStatus,
    plannedDate: textOrNull(row.planned_date),
    deliveryAddress: textOrNull(row.delivery_address),
    note: textOrNull(row.note),
    unitCount: Number(row.unit_count),
    shippedAt: dateOrNull(row.shipped_at),
    receivedDate: textOrNull(row.received_date),
    receiverName: textOrNull(row.receiver_name),
    cancelReason: textOrNull(row.cancel_reason),
    cancelledAt: dateOrNull(row.cancelled_at),
    createdAt: row.created_at as Date,
  };
}

export function toFileView(row: RawRow): DeliveryNoteFileView {
  return {
    id: Number(row.id),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at as Date,
  };
}

/** Per cabinet: how many QC rounds it has and whether one passed. */
export async function qcRoundSummaries(
  manager: EntityManager,
  unitIds: readonly number[],
): Promise<Map<number, { total: number; passed: boolean }>> {
  if (unitIds.length === 0) return new Map();
  const rows: RawRow[] = await manager.query(
    `SELECT unit_id, COUNT(*) AS total, BOOL_OR(result = 'passed') AS passed
       FROM qc_rounds
      WHERE unit_id = ANY($1::int[]) AND is_deleted = false
      GROUP BY unit_id`,
    [[...unitIds]],
  );
  return new Map(
    rows.map((row) => [
      Number(row.unit_id),
      { total: Number(row.total), passed: Boolean(row.passed) },
    ]),
  );
}

export interface LiveLine {
  noteCode: string;
  status: Exclude<DeliveryNoteStatus, DeliveryNoteStatus.CANCELLED>;
}

/** The non-cancelled note each of the cabinets is on, if any. */
export async function liveLines(
  manager: EntityManager,
  unitIds: readonly number[],
): Promise<Map<number, LiveLine>> {
  if (unitIds.length === 0) return new Map();
  const rows: RawRow[] = await manager.query(
    `SELECT du.unit_id, n.code, n.status
       FROM delivery_note_units du JOIN delivery_notes n ON n.id = du.note_id
      WHERE du.unit_id = ANY($1::int[]) AND du.active = true AND du.is_deleted = false`,
    [[...unitIds]],
  );
  return new Map(
    rows.map((row) => [
      Number(row.unit_id),
      { noteCode: String(row.code), status: row.status as LiveLine['status'] },
    ]),
  );
}
