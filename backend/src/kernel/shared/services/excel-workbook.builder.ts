import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import ExcelJS from 'exceljs';

import {
  EXCEL_DATE_FORMAT,
  EXCEL_DEFAULT_COLUMN_WIDTH,
  EXCEL_MAX_VALUE_LABELS,
} from '@shared/constants/excel';
import { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';
import { buildHeaderLayout } from '@shared/services/excel-header-layout';

import type {
  ExcelColumnSpecDto,
  ExcelFieldRefDto,
} from '@shared/dto/excel-sheet-spec.dto';

export type ExcelRow = Readonly<Record<string, unknown>>;

/** Called as rows are written: `(written, total)`, at most once per whole percent. */
export type ExcelProgressCallback = (done: number, total: number) => void;

/** One worksheet of a multi-sheet workbook: its layout, its rows and the fields it may read. */
export interface ExcelSheetInput {
  sheet: ExcelSheetSpecDto;
  rows: readonly ExcelRow[];
  allowedFields: readonly string[];
}

type CellValue = string | number | Date | null;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function invalidSpec(): BadRequestException {
  return new BadRequestException({
    message: 'Invalid Excel sheet spec',
    code: 'invalidSpec',
  });
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** The calendar day a value names, as a UTC midnight so Excel never shifts it. */
function toCalendarDate(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : new Date(
          Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()),
        );
  }
  const match = typeof raw === 'string' ? ISO_DATE.exec(raw) : null;
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function formatCalendarDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** One field's value as the typed cell it becomes on its own. */
function typedValue(ref: ExcelFieldRefDto, row: ExcelRow): CellValue {
  const raw = row[ref.field];
  if (isBlank(raw)) return null;

  if (typeof raw === 'string' && ref.valueLabels && raw in ref.valueLabels) {
    return ref.valueLabels[raw];
  }

  switch (ref.type ?? 'text') {
    case 'number': {
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    }
    case 'date':
      return toCalendarDate(raw);
    default:
      return String(raw);
  }
}

/** One field's value as the text it contributes to a combined cell. */
function textPart(ref: ExcelFieldRefDto, row: ExcelRow): string {
  const value = typedValue(ref, row);
  if (value === null) return '';
  return value instanceof Date ? formatCalendarDate(value) : String(value);
}

/**
 * Drops an optional-decimal section (`.` followed only by `#` digits, e.g. `#,##0.###`) from a
 * number format when the value being written is an integer, so Excel does not show a bare
 * trailing decimal separator (`1234.`) that no digit follows. A section that forces at least
 * one decimal (has a `0` in its fraction, e.g. `#,##0.00` or `#,##0.0#`) is left untouched.
 */
function numberFormatFor(value: number, format: string): string {
  if (!Number.isInteger(value)) return format;
  return format
    .split(';')
    .map((section) => section.replace(/\.#+$/, ''))
    .join(';');
}

function columnFields(column: ExcelColumnSpecDto): ExcelFieldRefDto[] {
  return column.fields?.length ? column.fields : [{ field: column.key }];
}

function cellValue(column: ExcelColumnSpecDto, row: ExcelRow): CellValue {
  const fields = columnFields(column);
  if (fields.length === 1) return typedValue(fields[0], row);

  const parts = fields.map((ref) => textPart(ref, row));
  if (column.combine === 'coalesce') {
    return parts.find((part) => part !== '') ?? null;
  }
  const joined = parts
    .filter((part) => part !== '')
    .join(column.joinWith ?? ' ');
  return joined === '' ? null : joined;
}

/** Start index and length of each run of consecutive rows sharing one group value. */
function rowRuns(
  rows: readonly ExcelRow[],
  groupField: string | undefined,
): Array<{ start: number; size: number }> {
  const runs: Array<{ start: number; size: number }> = [];
  rows.forEach((row, index) => {
    const value = groupField ? row[groupField] : undefined;
    const previous = runs[runs.length - 1];
    if (
      previous &&
      groupField &&
      !isBlank(value) &&
      rows[index - 1][groupField] === value
    ) {
      previous.size += 1;
    } else {
      runs.push({ start: index, size: 1 });
    }
  });
  return runs;
}

/**
 * Writes a list table to an `.xlsx` workbook exactly as the screen lays it out (C1).
 *
 * Labels are the ones the client drew; nothing here translates or derives a header from a
 * field name. Text is only ever written as a plain string value, never as a formula, so a
 * cell holding `=...` stays inert when the file is opened.
 */
@Injectable()
export class ExcelWorkbookBuilder {
  /**
   * Validates a spec before any work is queued or any worksheet exists. `allowedFields` is the
   * calling export source's allowlist; omit it for an import template, whose columns never
   * read a row.
   */
  assertSpec(
    sheet: ExcelSheetSpecDto,
    allowedFields?: readonly string[],
  ): ExcelSheetSpecDto {
    const spec = plainToInstance(ExcelSheetSpecDto, sheet);
    const errors = validateSync(spec, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) throw invalidSpec();

    for (const column of spec.columns) {
      for (const ref of columnFields(column)) {
        const labels = ref.valueLabels;
        if (
          labels &&
          (Object.keys(labels).length > EXCEL_MAX_VALUE_LABELS ||
            Object.values(labels).some(
              (label) => typeof label !== 'string' || label.length > 200,
            ))
        ) {
          throw invalidSpec();
        }
      }
    }

    if (allowedFields) {
      const allowed = new Set(allowedFields);
      const requested = [
        ...spec.columns.flatMap((column) =>
          columnFields(column).map((ref) => ref.field),
        ),
        ...(spec.rowGroupField ? [spec.rowGroupField] : []),
      ];
      const unknown = requested.find((field) => !allowed.has(field));
      if (unknown) {
        throw new BadRequestException({
          message: 'Field is not exportable',
          code: 'unknownField',
          field: unknown,
        });
      }
    }

    return spec;
  }

  async build(
    sheet: ExcelSheetSpecDto,
    rows: readonly ExcelRow[],
    allowedFields: readonly string[],
    onProgress?: ExcelProgressCallback,
  ): Promise<Buffer> {
    const spec = this.assertSpec(sheet, allowedFields);
    return this.write(spec, rows, onProgress);
  }

  /**
   * One workbook holding a worksheet per entry, in order, each laid out exactly as `build`
   * lays out a single one. Worksheet names must differ; an unnamed one is called `SheetN`.
   */
  async buildSheets(
    inputs: readonly ExcelSheetInput[],
    onProgress?: ExcelProgressCallback,
  ): Promise<Buffer> {
    const specs = inputs.map((input) =>
      this.assertSpec(input.sheet, input.allowedFields),
    );
    const names = specs.map(
      (spec, index) => spec.sheetName ?? `Sheet${index + 1}`,
    );
    if (
      new Set(names.map((name) => name.toLowerCase())).size !== names.length
    ) {
      throw invalidSpec();
    }

    const workbook = new ExcelJS.Workbook();
    const total = inputs.reduce((sum, input) => sum + input.rows.length, 0);
    let written = 0;
    specs.forEach((spec, index) => {
      const rows = inputs[index].rows;
      this.writeSheet(workbook, spec, names[index], rows, (done) => {
        onProgress?.(written + done, total);
      });
      written += rows.length;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /** A workbook holding only the header rows, for a reader to fill in and import. */
  async buildTemplate(sheet: ExcelSheetSpecDto): Promise<Buffer> {
    const spec = this.assertSpec(sheet);
    return this.write(spec, []);
  }

  private async write(
    spec: ExcelSheetSpecDto,
    rows: readonly ExcelRow[],
    onProgress?: ExcelProgressCallback,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    this.writeSheet(
      workbook,
      spec,
      spec.sheetName ?? 'Sheet1',
      rows,
      onProgress,
    );
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private writeSheet(
    workbook: ExcelJS.Workbook,
    spec: ExcelSheetSpecDto,
    name: string,
    rows: readonly ExcelRow[],
    onProgress?: ExcelProgressCallback,
  ): void {
    const worksheet = workbook.addWorksheet(name);
    const { depth, cells } = buildHeaderLayout(spec.columns);
    const headerRows = depth + 1;

    spec.columns.forEach((column, index) => {
      worksheet.getColumn(index + 1).width =
        column.width ?? EXCEL_DEFAULT_COLUMN_WIDTH;
    });

    for (const cell of cells) {
      const top = cell.row + 1;
      const left = cell.col + 1;
      const target = worksheet.getCell(top, left);
      const required =
        cell.columnIndex !== undefined &&
        spec.columns[cell.columnIndex]?.required === true;
      target.value = cell.label;
      target.font = { bold: true };
      target.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      // A required leaf header is marked by fill only, never by text, so its label stays
      // identical to the export it must round-trip with (I1).
      if (required) {
        target.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF2CC' },
        };
      }
      if (cell.rowSpan > 1 || cell.colSpan > 1) {
        worksheet.mergeCells(
          top,
          left,
          top + cell.rowSpan - 1,
          left + cell.colSpan - 1,
        );
      }
    }
    worksheet.views = [{ state: 'frozen', ySplit: headerRows }];

    const runs = rowRuns(rows, spec.rowGroupField);
    let lastPercent = -1;
    for (const run of runs) {
      for (let offset = 0; offset < run.size; offset += 1) {
        const index = run.start + offset;
        const sheetRow = headerRows + index + 1;
        spec.columns.forEach((column, colIndex) => {
          const spans = Boolean(column.groupSpan && spec.rowGroupField);
          if (spans && offset > 0) return;
          const cell = worksheet.getCell(sheetRow, colIndex + 1);
          const value = cellValue(column, rows[index]);
          cell.value = value;
          if (value instanceof Date) cell.numFmt = EXCEL_DATE_FORMAT;
          else if (typeof value === 'number' && column.numberFormat) {
            cell.numFmt = numberFormatFor(value, column.numberFormat);
          }
          if (spans && run.size > 1) {
            worksheet.mergeCells(
              sheetRow,
              colIndex + 1,
              sheetRow + run.size - 1,
              colIndex + 1,
            );
            cell.alignment = { vertical: 'middle' };
          }
        });

        const percent = Math.floor(((index + 1) / rows.length) * 100);
        if (onProgress && percent !== lastPercent) {
          lastPercent = percent;
          onProgress(index + 1, rows.length);
        }
      }
    }
  }
}
