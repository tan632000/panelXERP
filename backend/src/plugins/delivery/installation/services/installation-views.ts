import type { InstallationStatus } from '@plugins/delivery/installation/constants/installation.constant';

export type RawRow = Record<string, unknown>;

/** An installation as a list shows it. No price and no storage key anywhere. */
export interface InstallationSummary {
  id: number;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  projectName: string | null;
  status: InstallationStatus;
  siteAddress: string | null;
  plannedDate: string | null;
  personInCharge: string | null;
  note: string | null;
  photoCount: number;
  startedAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
}

export interface InstallationPhotoView {
  id: number;
  installationId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface InstallationDetail extends InstallationSummary {
  photos: InstallationPhotoView[];
}

export const INSTALLATION_SELECT = `
  SELECT i.id, i.order_id, i.status, i.site_address, i.planned_date::text AS planned_date,
         i.person_in_charge, i.note, i.started_at, i.done_at, i.created_at,
         (SELECT COUNT(*) FROM installation_photos p
           WHERE p.installation_id = i.id AND p.is_deleted = false) AS photo_count
    FROM installations i`;

export const PHOTO_SELECT = `
  SELECT p.id, p.installation_id, p.file_name, p.content_type, p.size_bytes, p.created_at
    FROM installation_photos p`;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const dateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : null;

export function toInstallationSummary(
  row: RawRow,
  order?: {
    code: string;
    customerName: string;
    projectName: string | null;
  } | null,
): InstallationSummary {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    orderCode: order?.code ?? null,
    customerName: order?.customerName ?? null,
    projectName: order?.projectName ?? null,
    status: row.status as InstallationStatus,
    siteAddress: textOrNull(row.site_address),
    plannedDate: textOrNull(row.planned_date),
    personInCharge: textOrNull(row.person_in_charge),
    note: textOrNull(row.note),
    photoCount: Number(row.photo_count),
    startedAt: dateOrNull(row.started_at),
    doneAt: dateOrNull(row.done_at),
    createdAt: row.created_at as Date,
  };
}

export function toPhotoView(row: RawRow): InstallationPhotoView {
  return {
    id: Number(row.id),
    installationId: Number(row.installation_id),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at as Date,
  };
}
