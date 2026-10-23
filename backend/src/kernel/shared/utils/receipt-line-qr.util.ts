/**
 * The QR a warehouse receipt line carries (spec `kho-nvl-qr-luong-moi-v01.md` /
 * `kho-xlbm-qr-luong-moi-v01.md` Requirement 5): a link to the receipt, focused on the line.
 *
 * A phone camera opens it as a page; the issue scan dialogs read the receipt number and the line
 * back out of it. The receipt is addressed by its number — the IQC stamp only knows the number —
 * and the line by its 1-based position, so one scan names exactly one lot. The origin differs per
 * deployment, so the stored payload is the path alone and the client prefixes its own origin.
 *
 * Mirrors the frontend's `buildReceiptLineQrUrl` (`warehouse/_shared/utils/receipt-line-qr.ts`):
 * the two must build the very same path, or a printed stamp stops matching its line.
 */
export type ReceiptQrWarehouse = 'rawMaterial' | 'xlbm' | 'semiFinished';

const BY_NO_PATH: Record<ReceiptQrWarehouse, string> = {
  rawMaterial: '/warehouse/raw-material/by-no/',
  xlbm: '/warehouse/xlbm/by-no/',
  semiFinished: '/warehouse/semi-finished/by-no/',
};

/** The query parameter carrying the item code printed under the QR. */
const CODE_PARAM = 'code';
/** The query parameter carrying the 1-based line number. */
const LINE_PARAM = 'line';

/** The path (without origin) the QR of one receipt line encodes. */
export function receiptLineQrPath(
  warehouse: ReceiptQrWarehouse,
  receiptNo: string,
  itemCode: string,
  lineIndex: number,
): string {
  return `${BY_NO_PATH[warehouse]}${encodeURIComponent(receiptNo)}?${CODE_PARAM}=${encodeURIComponent(itemCode)}&${LINE_PARAM}=${lineIndex + 1}`;
}

/** What a scanned receipt-line QR names. */
export interface ScannedReceiptLineQr {
  receiptNo: string;
  itemCode: string | null;
  /** 0-based line index; null when the link carries no usable line number. */
  lineIndex: number | null;
}

/**
 * Reads a scanned code as the receipt-line QR of `warehouse`, whatever origin it was printed with.
 * Returns null for anything else (another warehouse's link, a plain text payload, garbage).
 */
export function parseReceiptLineQr(
  warehouse: ReceiptQrWarehouse,
  scanned: string,
): ScannedReceiptLineQr | null {
  const code = scanned.trim();
  const prefix = BY_NO_PATH[warehouse];
  const start = code.indexOf(prefix);
  if (start < 0) return null;
  const rest = code.slice(start + prefix.length);
  const queryAt = rest.indexOf('?');
  const rawNo = queryAt < 0 ? rest : rest.slice(0, queryAt);
  // The number is one encoded path segment; a raw slash means a different page.
  if (rawNo.includes('/')) return null;
  let receiptNo: string;
  try {
    receiptNo = decodeURIComponent(rawNo).trim();
  } catch {
    return null;
  }
  if (!receiptNo) return null;
  const params = new URLSearchParams(
    queryAt < 0 ? '' : rest.slice(queryAt + 1),
  );
  const lineNo = Number(params.get(LINE_PARAM));
  return {
    receiptNo,
    itemCode: params.get(CODE_PARAM)?.trim() || null,
    lineIndex: Number.isInteger(lineNo) && lineNo >= 1 ? lineNo - 1 : null,
  };
}

/** Whether `scanned` is the QR of exactly this receipt line. */
export function matchesReceiptLineQr(
  warehouse: ReceiptQrWarehouse,
  scanned: string,
  line: { receiptNo: string; itemCode: string; lineIndex: number },
): boolean {
  const read = parseReceiptLineQr(warehouse, scanned);
  return (
    read !== null &&
    read.receiptNo.toUpperCase() === line.receiptNo.toUpperCase() &&
    read.lineIndex === line.lineIndex &&
    (read.itemCode === null ||
      read.itemCode.toUpperCase() === line.itemCode.toUpperCase())
  );
}
