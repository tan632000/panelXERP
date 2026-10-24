import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { EXCEL_IMPORT_MAX_FILE_BYTES } from '@shared/constants/excel';
import { ExcelParseError } from '@shared/services/excel-parse.error';
import { openBoundedZip } from '@shared/services/excel-sheet.parser';

/** Most data rows one import may carry. */
export const ITEM_IMPORT_MAX_ROWS = 2000;

/** The header is searched in these first sheet rows (the quotation layout puts it on row 13). */
const HEADER_SEARCH_ROWS = 50;

/**
 * Most rows holding any content the reader steps through before giving up. Empty rows are
 * not visited, so this bounds content rows; memory is bounded by the decompression check
 * and the upload size, not by this.
 */
const SHEET_ROW_CEILING = 20_000;

/** Most decompressed bytes an item workbook's zip entries may declare (a real sheet is far smaller). */
export const ITEM_IMPORT_MAX_DECOMPRESSED_BYTES = 30 * 1024 * 1024;

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export type ItemImportField =
  | 'name'
  | 'code'
  | 'brand'
  | 'unit'
  | 'referencePrice'
  | 'group'
  | 'specification'
  | 'note';

/** One sheet row below the header, cells as text (the price keeps a number when the cell is one). */
export interface ItemImportRawRow {
  /** 1-based sheet row, the one the reader sees. */
  row: number;
  name: string;
  code: string;
  brand: string;
  unit: string;
  referencePrice: string | number | null;
  group: string;
  specification: string;
  note: string;
  /** STT cell; a Roman numeral marks a panel section, not an item. */
  ordinal: string;
}

/** Lower-case, accent-free, single-spaced, so header text matches whatever accents the file carries. */
export function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function headerField(normalized: string): ItemImportField | 'ordinal' | null {
  if (normalized === 'stt') return 'ordinal';
  if (normalized === 'mo ta') return 'name';
  if (normalized === 'ma hang') return 'code';
  if (normalized === 'hang san xuat') return 'brand';
  if (normalized === 'dv tinh' || normalized === 'don vi tinh') return 'unit';
  if (normalized.startsWith('don gia')) return 'referencePrice';
  if (normalized === 'nhom') return 'group';
  if (normalized === 'quy cach' || normalized === 'thong so') {
    return 'specification';
  }
  if (normalized === 'ghi chu') return 'note';
  return null;
}

/** A cell's value as plain trimmed text, whatever shape ExcelJS hands it back in. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    // A date cell with a broken serial reads as an Invalid Date; it is not text.
    return Number.isNaN(value.getTime())
      ? ''
      : value.toISOString().slice(0, 10);
  }
  if ('richText' in value) {
    return value.richText
      .map((run) => run.text)
      .join('')
      .trim();
  }
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
  }
  if ('text' in value) return String(value.text).trim();
  return '';
}

function priceCell(value: ExcelJS.CellValue): string | number | null {
  if (typeof value === 'number') return value;
  if (
    value !== null &&
    typeof value === 'object' &&
    'result' in value &&
    typeof value.result === 'number'
  ) {
    return value.result;
  }
  const text = cellText(value);
  return text === '' ? null : text;
}

/** Rejects anything but a small `.xlsx`: extension, size and the zip signature. */
export function assertXlsxUpload(
  file: { originalname: string; size?: number; buffer?: Buffer } | undefined,
): Buffer {
  if (!file?.buffer) {
    throw new BadRequestException('An .xlsx file is required.');
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Only .xlsx files can be imported.');
  }
  if (file.buffer.length > EXCEL_IMPORT_MAX_FILE_BYTES) {
    throw new BadRequestException('The file exceeds the 5 MB limit.');
  }
  if (!XLSX_MAGIC.every((byte, index) => file.buffer?.[index] === byte)) {
    throw new BadRequestException('The file is not a valid .xlsx workbook.');
  }
  return file.buffer;
}

/**
 * Reads the first worksheet of a quotation-style workbook: finds the header row (the first one
 * holding both the description and the part-number column), maps its columns by header text and returns every
 * non-empty row below it. Which rows are items is decided by the caller.
 */
export async function readItemSheet(
  buffer: Buffer,
): Promise<ItemImportRawRow[]> {
  // The declared decompressed size is checked before ExcelJS inflates anything, so a small
  // zip bomb is refused here instead of exhausting memory while the workbook loads.
  try {
    await openBoundedZip(buffer, ITEM_IMPORT_MAX_DECOMPRESSED_BYTES);
  } catch (error: unknown) {
    if (error instanceof ExcelParseError) {
      throw new BadRequestException(
        'The file is not a valid .xlsx workbook or is too large once unpacked.',
      );
    }
    throw error;
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('The file is not a readable .xlsx workbook.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('The workbook has no worksheet.');

  let headerRow = 0;
  const columns = new Map<ItemImportField | 'ordinal', number>();
  const searchTo = Math.min(HEADER_SEARCH_ROWS, sheet.rowCount);
  for (let rowNumber = 1; rowNumber <= searchTo && !headerRow; rowNumber += 1) {
    const found = new Map<ItemImportField | 'ordinal', number>();
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
      const field = headerField(normalizeHeader(cellText(cell.value)));
      if (field && !found.has(field)) found.set(field, col);
    });
    if (found.has('name') && found.has('code')) {
      headerRow = rowNumber;
      found.forEach((col, field) => columns.set(field, col));
    }
  }
  if (!headerRow) {
    throw new BadRequestException(
      'Header row not found: the sheet needs the columns "MÔ TẢ" and "MÃ HÀNG".',
    );
  }

  // A cell covered by a merge holds the master's value; only the master cell counts, so a
  // sub-assembly title merged across the description and part-number columns is not read
  // as a code or a unit.
  const valueOf = (row: ExcelJS.Row, col: number): ExcelJS.CellValue => {
    const cell = row.getCell(col);
    if (cell.isMerged && cell.master.address !== cell.address) return null;
    return cell.value;
  };
  const text = (row: ExcelJS.Row, field: ItemImportField | 'ordinal') => {
    const col = columns.get(field);
    return col ? cellText(valueOf(row, col)) : '';
  };
  const priceCol = columns.get('referencePrice');

  const rows: ItemImportRawRow[] = [];
  let scanned = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    scanned += 1;
    if (scanned > SHEET_ROW_CEILING) {
      throw new BadRequestException('The sheet has too many rows.');
    }
    const raw: ItemImportRawRow = {
      row: rowNumber,
      name: text(row, 'name'),
      code: text(row, 'code'),
      brand: text(row, 'brand'),
      unit: text(row, 'unit'),
      referencePrice: priceCol ? priceCell(valueOf(row, priceCol)) : null,
      group: text(row, 'group'),
      specification: text(row, 'specification'),
      note: text(row, 'note'),
      ordinal: text(row, 'ordinal'),
    };
    const empty =
      !raw.name &&
      !raw.code &&
      !raw.brand &&
      !raw.unit &&
      raw.referencePrice === null;
    if (empty) return;
    rows.push(raw);
    if (rows.length > ITEM_IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `The sheet has more than ${ITEM_IMPORT_MAX_ROWS} data rows.`,
      );
    }
  });
  if (rows.length === 0) {
    throw new BadRequestException('The sheet has no data rows.');
  }
  return rows;
}
