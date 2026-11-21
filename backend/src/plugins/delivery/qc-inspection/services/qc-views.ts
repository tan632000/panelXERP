import type { QcDefectStatus } from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';

export type RawRow = Record<string, unknown>;

export interface QcDefectView {
  id: number;
  unitId: number;
  unitCode: string;
  roundNo: number;
  description: string;
  status: QcDefectStatus;
  fixNote: string | null;
  fixedBy: number | null;
  fixedByName: string | null;
  fixedAt: Date | null;
  verifiedBy: number | null;
  verifiedByName: string | null;
  verifiedAt: Date | null;
}

/** A photo as the API lists it. The storage key stays server-side. */
export interface QcPhotoView {
  id: number;
  roundItemId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdBy: number | null;
  createdAt: Date;
}

export const PHOTO_SELECT = `
  SELECT p.id, p.round_item_id, p.file_name, p.content_type, p.size_bytes,
         p.created_by, p.created_at
    FROM qc_photos p`;

export function toPhotoView(row: RawRow): QcPhotoView {
  return {
    id: Number(row.id),
    roundItemId: Number(row.round_item_id),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    createdBy: row.created_by === null ? null : Number(row.created_by),
    createdAt: row.created_at as Date,
  };
}

export const DEFECT_SELECT = `
  SELECT d.id, d.unit_id, u.code AS unit_code, r.round_no, d.description, d.status,
         d.fix_note, d.fixed_by, fixer.full_name AS fixed_by_name, d.fixed_at,
         d.verified_by, verifier.full_name AS verified_by_name, d.verified_at
    FROM qc_defects d
    JOIN production_units u ON u.id = d.unit_id
    JOIN production_orders po ON po.id = u.production_order_id
    JOIN qc_round_items it ON it.id = d.round_item_id
    JOIN qc_rounds r ON r.id = it.round_id
    LEFT JOIN users fixer ON fixer.id = d.fixed_by
    LEFT JOIN users verifier ON verifier.id = d.verified_by`;

const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const dateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : null;

export function toDefectView(row: RawRow): QcDefectView {
  return {
    id: Number(row.id),
    unitId: Number(row.unit_id),
    unitCode: String(row.unit_code),
    roundNo: Number(row.round_no),
    description: String(row.description),
    status: row.status as QcDefectStatus,
    fixNote: textOrNull(row.fix_note),
    fixedBy: numberOrNull(row.fixed_by),
    fixedByName: textOrNull(row.fixed_by_name),
    fixedAt: dateOrNull(row.fixed_at),
    verifiedBy: numberOrNull(row.verified_by),
    verifiedByName: textOrNull(row.verified_by_name),
    verifiedAt: dateOrNull(row.verified_at),
  };
}
