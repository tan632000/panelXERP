export type RawRow = Record<string, unknown>;

export interface AcceptanceFileView {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

/** The acceptance minutes of an order. No price and no storage key anywhere. */
export interface AcceptanceView {
  id: number;
  orderId: number;
  representativeName: string;
  signedDate: string;
  createdAt: Date;
  files: AcceptanceFileView[];
}

export const ACCEPTANCE_SELECT = `
  SELECT a.id, a.order_id, a.representative_name, a.signed_date::text AS signed_date, a.created_at
    FROM acceptances a`;

export const FILE_SELECT = `
  SELECT f.id, f.file_name, f.content_type, f.size_bytes, f.created_at
    FROM acceptance_files f`;

export function toFileView(row: RawRow): AcceptanceFileView {
  return {
    id: Number(row.id),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at as Date,
  };
}

export function toAcceptanceView(row: RawRow, files: RawRow[]): AcceptanceView {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    representativeName: String(row.representative_name),
    signedDate: String(row.signed_date),
    createdAt: row.created_at as Date,
    files: files.map(toFileView),
  };
}
