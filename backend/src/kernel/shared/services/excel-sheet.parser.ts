import { PassThrough, type Readable } from 'stream';

import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import {
  EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES,
  EXCEL_IMPORT_MAX_MERGE_RANGES,
  EXCEL_IMPORT_MAX_REQUIRED_ISSUES,
  EXCEL_IMPORT_MAX_ROWS,
  EXCEL_IMPORT_MERGE_SCAN_MAX_BYTES,
  EXCEL_IMPORT_ROW_CEILING,
} from '@shared/constants/excel';
import { ExcelParseError } from '@shared/services/excel-parse.error';

import type { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';
import type { ExcelParseIssue } from '@shared/services/excel-parse.error';
import type { ExcelProgressCallback } from '@shared/services/excel-workbook.builder';
import type { Row } from 'exceljs';

/** One data row of an import, keyed by the spec's column keys. */
export interface ExcelParsedRow {
  /** 1-based row number in the sheet, so errors point at the row the reader sees. */
  fileRow: number;
  values: Record<string, string>;
}

/**
 * A completed parse: every row read, plus any non-fatal issue found while reading them. Unlike
 * a header problem (`missingColumns`/`duplicateColumn`) or an unreadable file, a blank required
 * cell does not stop the read — the caller's own business validation still needs every other
 * row's rules to run in the same pass, so the reader fixes every problem at once instead of one
 * `requiredMissing` at a time.
 */
export interface ExcelParseOutcome {
  rows: ExcelParsedRow[];
  issues: ExcelParseIssue[];
}

/** A merged range read from the sheet's raw XML, 1-based and inclusive on every side. */
interface MergeRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A cell's value as plain text: dates as `YYYY-MM-DD`, numbers without grouping. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return String(value);
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

function normalizeHeader(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
}

/** Drops empty entries and collapses a label repeated down a vertically merged header. */
function headerPath(texts: readonly string[]): string[] {
  const path: string[] = [];
  for (const text of texts) {
    const normalized = normalizeHeader(text);
    if (normalized && path[path.length - 1] !== normalized) {
      path.push(normalized);
    }
  }
  return path;
}

function columnLettersToNumber(letters: string): number {
  let col = 0;
  for (const char of letters) {
    col = col * 26 + (char.charCodeAt(0) - 64);
  }
  return col;
}

const CELL_REF = /^([A-Z]+)(\d+)$/;

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = CELL_REF.exec(ref);
  if (!match) return null;
  return { row: Number(match[2]), col: columnLettersToNumber(match[1]) };
}

const MERGE_CELL_TAG = /<mergeCell\s+ref="([A-Z]+\d+):([A-Z]+\d+)"\s*\/>/g;
const SHEET_FILE_NUMBER = /sheet(\d+)\.xml$/;

/** The numeric suffix of a `xl/worksheets/sheetN.xml` entry path, or 0 if it has none. */
function sheetFileNumber(path: string): number {
  const match = SHEET_FILE_NUMBER.exec(path);
  return match ? Number(match[1]) : 0;
}

const WORKSHEET_PATH = /^xl\/worksheets\/sheet\d+\.xml$/;

/**
 * The upload re-streamed with every worksheet moved to the end of the zip, each entry's
 * compressed bytes reused as they are (nothing is decompressed or buffered whole).
 *
 * ExcelJS's streaming reader needs `xl/workbook.xml`, the workbook rels and the shared strings
 * before it can read a sheet, but Excel and ExcelJS both write the worksheets first and
 * `xl/workbook.xml` last. The reader then spools the sheet to a temporary file while it waits,
 * and its unzip dependency (`unzipper` 0.10) silently stops emitting entries when that write is
 * slow — as on a busy disk — so `xl/workbook.xml` is never read and the sheet fails with a
 * `TypeError` (seen as an intermittent `invalidFile`). With the worksheets last, everything the
 * sheet depends on has been read by the time it arrives, the sheet is read straight from the
 * stream, and whatever might be dropped after it is not needed.
 */
function worksheetsLast(zip: JSZip): Readable {
  const worksheets = Object.keys(zip.files)
    .filter((path) => WORKSHEET_PATH.test(path))
    .sort((a, b) => sheetFileNumber(a) - sheetFileNumber(b));
  for (const path of worksheets) {
    // `files` keeps insertion order, and the zip is written in that order.
    const entry = zip.files[path];
    delete zip.files[path];
    zip.files[path] = entry;
  }
  // DEFLATE is what Excel and ExcelJS write, so JSZip hands each entry's compressed data on
  // untouched. The PassThrough makes JSZip's `readable-stream` a core stream, the only kind the
  // reader accepts.
  const output = new PassThrough();
  const source = zip.generateNodeStream({
    compression: 'DEFLATE',
    streamFiles: false,
  });
  source.on('error', (error: Error) => output.destroy(error));
  source.pipe(output);
  return output;
}

/**
 * Longer than any real `<mergeCell ref="XFD1048576:XFD1048576"/>` tag, so keeping this many
 * trailing characters between chunks is always enough to bridge one split across a chunk
 * boundary.
 */
const MERGE_TAG_CARRY_CHARS = 64;

/**
 * JSZip's own private field for a loaded entry's compressed data, documented (but not made
 * public) in its own type definitions as the only place `uncompressedSize` is available
 * without decompressing the entry — see the commented-out `CompressedObject` interface in
 * `jszip`'s `index.d.ts`.
 */
interface JSZipEntryData {
  uncompressedSize?: number;
}

/** An entry's declared uncompressed size, read from the zip's central directory, or `null` if it cannot be trusted. */
function declaredUncompressedSize(entry: JSZip.JSZipObject): number | null {
  const size = (entry as unknown as { _data?: JSZipEntryData })._data
    ?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0
    ? size
    : null;
}

/**
 * Opens an uploaded zip and rejects it when its entries claim more total decompressed content
 * than `maxBytes` (default `EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES`), read from the central
 * directory before any entry is decompressed. An entry whose declared size cannot be trusted is
 * refused outright, since an unreadable size is exactly what a zip bomb depends on to hide its
 * real cost. Callers that load the workbook another way (a feature reading it whole) run this
 * first.
 */
export async function openBoundedZip(
  buffer: Buffer,
  maxBytes: number = EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES,
): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ExcelParseError('invalidFile');
  }

  let totalBytes = 0;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const size = declaredUncompressedSize(entry);
    if (size === null) throw new ExcelParseError('invalidFile');
    totalBytes += size;
    if (totalBytes > maxBytes) {
      throw new ExcelParseError('invalidFile');
    }
  }
  return zip;
}

/**
 * Reads the first worksheet of an uploaded `.xlsx` into rows keyed by the spec's columns.
 *
 * Rows are read with the streaming reader so a small, highly compressed file with one styled
 * cell far down the sheet cannot force the whole workbook (row and cell object graph included)
 * into memory, and the zip's declared total decompressed size is checked before anything is
 * decompressed at all, so a zip bomb is refused outright. Merged cells are not resolved by the
 * streaming reader, so every merge range (header and data) is read once, as a bounded stream
 * over the worksheet's raw XML, and used to fill in the value a merged cell would otherwise
 * leave blank: header labels for a merged header, and — for a vertical `groupSpan` merge, the
 * shape `ExcelWorkbookBuilder` writes for a grouped row — the row group's value on every row it
 * covers, exactly as the file looks on screen and as the old, fully-loaded reader used to
 * resolve it via ExcelJS's own `cell.master`.
 *
 * Columns are matched by the display label the reader sees (group path included), never by
 * position or by key, so a template stays readable after columns are reordered or extra
 * columns are added. Nothing here writes anywhere; the caller decides what the rows mean.
 */
@Injectable()
export class ExcelSheetParser {
  async parse(
    buffer: Buffer,
    sheet: ExcelSheetSpecDto,
    onProgress?: ExcelProgressCallback,
  ): Promise<ExcelParseOutcome> {
    const depth = sheet.columns.reduce(
      (max, column) => Math.max(max, column.headerGroup?.length ?? 0),
      0,
    );
    const headerRows = depth + 1;
    // The size guard reads only the zip's central directory (metadata, not content) and must
    // run before anything decompresses a single byte of it, so a zip bomb is refused up front
    // instead of only being caught by the streaming reader's own row ceiling.
    const zip = await this.assertBoundedZip(buffer);
    const mergeRanges = await this.readHeaderMerges(zip);

    try {
      return await this.readRows(
        worksheetsLast(zip),
        sheet,
        headerRows,
        mergeRanges,
        onProgress,
      );
    } catch (error) {
      if (error instanceof ExcelParseError) throw error;
      throw new ExcelParseError('invalidFile');
    }
  }

  private async readRows(
    source: Readable,
    sheet: ExcelSheetSpecDto,
    headerRows: number,
    mergeRanges: readonly MergeRange[],
    onProgress?: ExcelProgressCallback,
  ): Promise<ExcelParseOutcome> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(source, {
      worksheets: 'emit',
      sharedStrings: 'cache',
      // Styles must be cached, not ignored: a date cell is only a formatted number without
      // its style's numFmt, and the style table itself is small (bounded by the workbook's
      // own style definitions, not by row count), so this does not reintroduce the row/cell
      // object-graph blowup this streaming switch exists to avoid.
      styles: 'cache',
      hyperlinks: 'ignore',
      entries: 'ignore',
    });

    let sawWorksheet = false;
    const headerValues = new Map<string, string>();
    let maxHeaderCol = mergeRanges.reduce(
      (max, range) => Math.max(max, range.right),
      0,
    );
    let columnIndexByKey: Map<string, number> | null = null;
    const rows: ExcelParsedRow[] = [];
    let rawRowsRead = 0;
    let lastPercent = -1;
    const requiredLabelByKey = new Map<string, string>();
    for (const column of sheet.columns) {
      if (column.required) requiredLabelByKey.set(column.key, column.label);
    }
    const requiredIssues: ExcelParseIssue[] = [];

    // One entry per kept merge range (bounded by EXCEL_IMPORT_MAX_MERGE_RANGES), keyed by its
    // master cell, so a covered data cell can be filled in the instant its row is read.
    const mergeTopByCell = new Map<string, MergeRange>();
    for (const range of mergeRanges) {
      mergeTopByCell.set(`${range.top}:${range.left}`, range);
    }
    // The merge currently "open" for each column, bounded by the columns actually read
    // (EXCEL_MAX_COLUMNS at most) rather than by how many rows a merge spans.
    const openMergeByCol = new Map<number, { value: string; bottom: number }>();

    const ensureHeaderMatched = (): Map<string, number> => {
      if (!columnIndexByKey) {
        columnIndexByKey = this.matchColumns(
          headerValues,
          mergeRanges,
          maxHeaderCol,
          headerRows,
          sheet,
        );
      }
      return columnIndexByKey;
    };

    for await (const worksheetReader of reader) {
      if (sawWorksheet) break; // only the first worksheet is read
      sawWorksheet = true;

      for await (const row of worksheetReader as AsyncIterable<Row>) {
        rawRowsRead += 1;
        if (rawRowsRead > EXCEL_IMPORT_ROW_CEILING) {
          throw new ExcelParseError('tooManyRows');
        }

        const fileRow = row.number;
        if (fileRow <= headerRows) {
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            headerValues.set(`${fileRow}:${colNumber}`, cellText(cell.value));
            if (colNumber > maxHeaderCol) maxHeaderCol = colNumber;
          });
          continue;
        }

        const columns = ensureHeaderMatched();
        const values: Record<string, string> = {};
        let hasValue = false;
        for (const [key, col] of columns) {
          const raw = cellText(row.getCell(col).value);
          const text = this.resolveDataCell(
            mergeTopByCell,
            openMergeByCol,
            fileRow,
            col,
            raw,
          );
          values[key] = text;
          if (text !== '') hasValue = true;
        }
        if (hasValue) {
          rows.push({ fileRow, values });
          if (rows.length > EXCEL_IMPORT_MAX_ROWS) {
            throw new ExcelParseError('tooManyRows');
          }
          if (requiredIssues.length < EXCEL_IMPORT_MAX_REQUIRED_ISSUES) {
            for (const [key, label] of requiredLabelByKey) {
              if (values[key] === '') {
                requiredIssues.push({
                  fileRow,
                  column: label,
                  code: 'requiredMissing',
                });
                if (requiredIssues.length >= EXCEL_IMPORT_MAX_REQUIRED_ISSUES) {
                  break;
                }
              }
            }
          }
        }

        if (onProgress) {
          const percent = Math.min(
            99,
            Math.floor((rows.length / EXCEL_IMPORT_MAX_ROWS) * 100),
          );
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress(rows.length, EXCEL_IMPORT_MAX_ROWS);
          }
        }
      }
    }

    if (!sawWorksheet) throw new ExcelParseError('invalidFile');
    ensureHeaderMatched();

    if (rows.length === 0) throw new ExcelParseError('emptyFile');
    if (onProgress) onProgress(EXCEL_IMPORT_MAX_ROWS, EXCEL_IMPORT_MAX_ROWS);
    // Not fatal: every row is still returned alongside every blank-required-cell issue found
    // (capped at EXCEL_IMPORT_MAX_REQUIRED_ISSUES), so the caller's business validation can run
    // over the same rows and the reader sees every problem — file-level and row-level — at once.
    return { rows, issues: requiredIssues };
  }

  /**
   * Fills a data cell covered by a vertical merge with its range's master value, remembered
   * when that master row was read — rows arrive in file order, so the master is always seen
   * before the cells it covers. Only vertical (single-column, `top === bottom` spanning down)
   * merges are resolved this way: it is the only shape `ExcelWorkbookBuilder` ever writes into
   * data rows (`groupSpan`). A horizontal merge hand-placed inside the data rows keeps the same
   * best-effort blank it always had; header merges are unaffected, they are matched separately.
   */
  private resolveDataCell(
    mergeTopByCell: ReadonlyMap<string, MergeRange>,
    openMergeByCol: Map<number, { value: string; bottom: number }>,
    fileRow: number,
    col: number,
    raw: string,
  ): string {
    const starting = mergeTopByCell.get(`${fileRow}:${col}`);
    if (starting) {
      openMergeByCol.set(col, { value: raw, bottom: starting.bottom });
      return raw;
    }
    const open = openMergeByCol.get(col);
    if (open && fileRow <= open.bottom) {
      return raw !== '' ? raw : open.value;
    }
    return raw;
  }

  private assertBoundedZip(buffer: Buffer): Promise<JSZip> {
    return openBoundedZip(buffer);
  }

  /**
   * Reads every merge range (header and data alike), straight from the first worksheet's raw
   * XML. `mergeCell` elements are not surfaced by the streaming reader, and this is the one
   * part of parsing that still needs the sheet's decompressed text — read as a bounded stream,
   * a chunk at a time, with only a short carry-over buffer kept between chunks (constant
   * memory) and a hard stop at `EXCEL_IMPORT_MERGE_SCAN_MAX_BYTES`. Losing more than
   * `EXCEL_IMPORT_MAX_MERGE_RANGES` ranges fails the import outright (`invalidFile`) instead of
   * silently dropping some, since a data cell's real value — not just header cosmetics — can
   * depend on one. Any other read problem (a stream error, an unparseable zip entry) is
   * best-effort: the file just loses merge resolution; the row reader below is still the
   * source of truth for `invalidFile` otherwise.
   */
  private async readHeaderMerges(zip: JSZip): Promise<MergeRange[]> {
    const sheetPath = Object.keys(zip.files)
      .filter((path) => WORKSHEET_PATH.test(path))
      .sort((a, b) => sheetFileNumber(a) - sheetFileNumber(b))[0];
    if (!sheetPath) return [];

    const ranges: MergeRange[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const stream = zip.files[sheetPath].nodeStream();
        let carry = '';
        let bytesScanned = 0;
        const finish = () => {
          stream.removeAllListeners();
          (stream as unknown as { destroy?: () => void }).destroy?.();
        };

        stream.on('data', (chunk: Buffer) => {
          bytesScanned += chunk.length;
          const text = carry + chunk.toString('utf8');
          MERGE_CELL_TAG.lastIndex = 0;
          let match: RegExpExecArray | null;
          let lastConsumed = 0;
          while ((match = MERGE_CELL_TAG.exec(text))) {
            const from = parseCellRef(match[1]);
            const to = parseCellRef(match[2]);
            if (from && to) {
              if (ranges.length >= EXCEL_IMPORT_MAX_MERGE_RANGES) {
                finish();
                reject(new ExcelParseError('invalidFile'));
                return;
              }
              ranges.push({
                top: from.row,
                left: from.col,
                bottom: to.row,
                right: to.col,
              });
            }
            lastConsumed = MERGE_CELL_TAG.lastIndex;
          }
          // Only the tail that could still be the start of a split tag survives into the next
          // chunk, so memory stays constant regardless of how large the sheet's XML is.
          carry = text.slice(
            Math.max(lastConsumed, text.length - MERGE_TAG_CARRY_CHARS),
          );

          if (bytesScanned > EXCEL_IMPORT_MERGE_SCAN_MAX_BYTES) {
            finish();
            resolve();
          }
        });
        stream.on('end', () => {
          finish();
          resolve();
        });
        stream.on('error', () => {
          finish();
          resolve();
        });
      });
    } catch (error) {
      if (error instanceof ExcelParseError) throw error;
      return [];
    }
    return ranges;
  }

  /** Maps every spec column key to its 1-based sheet column, or reports every mismatch. */
  private matchColumns(
    headerValues: ReadonlyMap<string, string>,
    mergeRanges: readonly MergeRange[],
    maxHeaderCol: number,
    headerRows: number,
    sheet: ExcelSheetSpecDto,
  ): Map<string, number> {
    const resolve = (row: number, col: number): string => {
      const direct = headerValues.get(`${row}:${col}`);
      if (direct !== undefined) return direct;
      const range = mergeRanges.find(
        (candidate) =>
          row >= candidate.top &&
          row <= candidate.bottom &&
          col >= candidate.left &&
          col <= candidate.right,
      );
      return range
        ? (headerValues.get(`${range.top}:${range.left}`) ?? '')
        : '';
    };

    const sheetPaths: string[][] = [];
    for (let col = 1; col <= maxHeaderCol; col += 1) {
      const texts: string[] = [];
      for (let row = 1; row <= headerRows; row += 1) {
        texts.push(resolve(row, col));
      }
      sheetPaths.push(headerPath(texts));
    }

    const issues: ExcelParseIssue[] = [];
    const indexByKey = new Map<string, number>();
    for (const column of sheet.columns) {
      const expected = headerPath([
        ...(column.headerGroup ?? []),
        column.label,
      ]).join('\u0000');
      const matches = sheetPaths
        .map((path, index) => (path.join('\u0000') === expected ? index : -1))
        .filter((index) => index >= 0);

      if (matches.length === 0) {
        issues.push({ fileRow: 1, code: 'missingColumns', column: column.key });
      } else if (matches.length > 1) {
        issues.push({
          fileRow: 1,
          code: 'duplicateColumn',
          column: column.key,
        });
      } else {
        indexByKey.set(column.key, matches[0] + 1);
      }
    }

    if (issues.length > 0) {
      throw new ExcelParseError(issues[0].code, issues);
    }
    return indexByKey;
  }
}
