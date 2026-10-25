import { existsSync } from 'fs';

import ExcelJS from 'exceljs';

import {
  greetingLines,
  QUOTATION_LOGO_PATH,
  TABLE_HEADERS,
  type QuotationDocument,
} from '@plugins/sales/quotation/utils/quotation-document.util';

import type { Alignment, Border, Worksheet } from 'exceljs';

const FONT = 'Arial';
const MONEY_FORMAT = '#,##0';
const PANEL_FILL = 'FFFFC000';
const TOTAL_FILL = 'FF92D050';
const THIN: Partial<Border> = { style: 'thin' };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const COLUMN_WIDTHS = [6, 48, 24, 20, 12, 12, 18, 20];
const LAST_COLUMN = 'H';

const CENTER: Partial<Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
};

/** Writes the customer-facing quotation in the layout of the company's BG sheet. */
export async function renderQuotationXlsx(
  doc: QuotationDocument,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('List', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });
  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  let row = writeLetterhead(sheet, doc);
  if (existsSync(QUOTATION_LOGO_PATH)) {
    const logo = workbook.addImage({
      filename: QUOTATION_LOGO_PATH,
      extension: 'jpeg',
    });
    sheet.addImage(logo, {
      tl: { col: 1.06, row: 0 },
      ext: { width: 188, height: 110 },
    });
  }
  row = writeParties(sheet, doc, row);
  row = writeTable(sheet, doc, row);
  writeFooter(sheet, doc, row);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  height?: number;
  align?: Partial<Alignment>;
  from?: string;
  to?: string;
}

/** A merged, styled text line across A:H (or `from:to`). */
function textRow(
  sheet: Worksheet,
  row: number,
  text: string,
  style: TextStyle = {},
): void {
  const from = style.from ?? 'A';
  const to = style.to ?? LAST_COLUMN;
  if (from !== to) sheet.mergeCells(`${from}${row}:${to}${row}`);
  const cell = sheet.getCell(`${from}${row}`);
  cell.value = text;
  cell.font = {
    name: FONT,
    size: style.size ?? 11,
    bold: style.bold,
    italic: style.italic,
  };
  cell.alignment = style.align ?? { horizontal: 'center', wrapText: true };
  if (style.height) sheet.getRow(row).height = style.height;
}

function writeLetterhead(sheet: Worksheet, doc: QuotationDocument): number {
  const { letterhead } = doc;
  textRow(sheet, 1, letterhead.name, { bold: true, size: 20, height: 39 });
  textRow(sheet, 2, letterhead.address, { height: 16.5 });
  textRow(
    sheet,
    3,
    `Website: ${letterhead.website}.  MST: ${letterhead.taxCode}`,
    { bold: true, height: 15 },
  );
  const accounts = letterhead.bankAccounts.join('\n ');
  textRow(sheet, 4, `STK: ${accounts}`, {
    height: Math.max(16.5, 16.5 * letterhead.bankAccounts.length),
  });
  textRow(sheet, 5, 'BẢNG CHÀO GIÁ', { bold: true, size: 20, height: 39 });
  textRow(sheet, 6, `Số: ${doc.code}`, { bold: true, size: 12, height: 15 });
  return 7;
}

/** Customer, date, recipient and sender, greeting. Returns the row of the table header. */
function writeParties(
  sheet: Worksheet,
  doc: QuotationDocument,
  first: number,
): number {
  const left: Partial<Alignment> = { horizontal: 'left' };
  textRow(sheet, first, `Kính gửi: ${doc.customerName}`, {
    align: left,
    bold: true,
    from: 'A',
    to: 'D',
    height: 21.75,
  });
  const dateLabel = sheet.getCell(`E${first}`);
  dateLabel.value = 'Ngày báo giá:';
  dateLabel.font = { name: FONT, size: 11, bold: true };
  const date = sheet.getCell(`F${first}`);
  date.value = doc.quotedOn;
  date.font = { name: FONT, size: 11, bold: true };

  const lines: Array<[string, string]> = [
    [`Người nhận: ${doc.recipient.name}`, `Người gửi: ${doc.sender.name}`],
    [`Điện thoại: ${doc.recipient.phone}`, `Điện thoại: ${doc.sender.phone}`],
    [`Email: ${doc.recipient.email}`, `Email: ${doc.sender.email}`],
  ];
  lines.forEach(([recipient, sender], index) => {
    const row = first + 1 + index;
    sheet.getRow(row).height = 18;
    const a = sheet.getCell(`A${row}`);
    a.value = recipient;
    a.font = { name: FONT, size: 11, bold: true };
    const e = sheet.getCell(`E${row}`);
    e.value = sender;
    e.font = { name: FONT, size: 11, bold: true };
  });

  const greeting = first + 4;
  const greetings = greetingLines(doc.letterhead.name);
  greetings.forEach((line, index) => {
    textRow(sheet, greeting + index, line, {
      align: left,
      italic: true,
      height: 18,
    });
  });
  return greeting + greetings.length;
}

function styleRow(
  sheet: Worksheet,
  row: number,
  options: { bold?: boolean; fill?: string; height?: number },
): void {
  const target = sheet.getRow(row);
  if (options.height) target.height = options.height;
  for (let col = 1; col <= 8; col += 1) {
    const cell = target.getCell(col);
    cell.font = { name: FONT, size: 10, bold: options.bold };
    cell.border = BOX;
    cell.alignment = CENTER;
    if (options.fill) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: options.fill },
      };
    }
    if (col >= 7) cell.numFmt = MONEY_FORMAT;
  }
}

/** Header, one section per panel with its BOM, then the totals. Returns the next free row. */
function writeTable(
  sheet: Worksheet,
  doc: QuotationDocument,
  headerRow: number,
): number {
  sheet.getRow(headerRow).values = [...TABLE_HEADERS];
  styleRow(sheet, headerRow, { bold: true, height: 31.5 });

  let row = headerRow + 1;
  for (const panel of doc.panels) {
    sheet.getRow(row).values = [
      panel.numeral,
      panel.title,
      '',
      '',
      '',
      panel.quantity,
      panel.unitPrice,
      panel.amount,
    ];
    styleRow(sheet, row, { bold: true, fill: PANEL_FILL, height: 30.75 });
    row += 1;

    for (const bom of panel.bomLines) {
      sheet.getRow(row).values = [
        '',
        bom.description,
        bom.code,
        bom.brand,
        bom.unit,
        bom.quantity,
      ];
      styleRow(sheet, row, {});
      sheet.getCell(`B${row}`).alignment = { ...CENTER, horizontal: 'left' };
      row += 1;
    }
  }

  const totals: Array<[string, number]> = [['Tổng', doc.subtotal]];
  if (doc.discountAmount > 0) {
    totals.push([doc.discountLabel, doc.discountAmount]);
  }
  totals.push(
    [`Thuế VAT ${doc.vatRate}%`, doc.vatAmount],
    ['Tổng sau thuế', doc.total],
  );
  for (const [label, amount] of totals) {
    sheet.mergeCells(`E${row}:F${row}`);
    sheet.mergeCells(`G${row}:H${row}`);
    sheet.getCell(`E${row}`).value = label;
    sheet.getCell(`G${row}`).value = amount;
    for (const col of ['E', 'F', 'G', 'H']) {
      const cell = sheet.getCell(`${col}${row}`);
      cell.font = { name: FONT, size: 10, bold: true };
      cell.border = BOX;
      cell.alignment = CENTER;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: TOTAL_FILL },
      };
    }
    sheet.getCell(`G${row}`).numFmt = MONEY_FORMAT;
    sheet.getRow(row).height = 18;
    row += 1;
  }
  return row;
}

function writeFooter(
  sheet: Worksheet,
  doc: QuotationDocument,
  afterTable: number,
): void {
  let row = afterTable + 1;
  const note = sheet.getCell(`A${row}`);
  note.value = 'Ghi chú:';
  note.font = { name: FONT, size: 10, bold: true };
  row += 1;

  doc.terms.forEach((term, index) => {
    const number = sheet.getCell(`A${row}`);
    number.value = `${index + 1}.`;
    number.font = { name: FONT, size: 10 };
    number.alignment = { horizontal: 'right' };
    sheet.mergeCells(`B${row}:H${row}`);
    const text = sheet.getCell(`B${row}`);
    text.value = term;
    text.font = { name: FONT, size: 10, italic: true };
    text.alignment = { wrapText: true, vertical: 'top' };
    row += 1;
  });

  row += 1;
  const confirm = sheet.getCell(`B${row}`);
  confirm.value = 'Xác nhận đặt hàng';
  confirm.font = { name: FONT, size: 10, bold: true };
  confirm.alignment = { horizontal: 'center' };
  const place = sheet.getCell(`E${row}`);
  place.value = doc.placeAndDate;
  place.font = { name: FONT, size: 10, bold: true };
}
