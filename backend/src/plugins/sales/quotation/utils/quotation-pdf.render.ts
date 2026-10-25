import { existsSync } from 'fs';

import PDFDocument from 'pdfkit';

import {
  formatVnd,
  greetingLines,
  QUOTATION_FONT_BOLD,
  QUOTATION_FONT_REGULAR,
  QUOTATION_LOGO_PATH,
  TABLE_HEADERS,
  type QuotationDocument,
} from '@plugins/sales/quotation/utils/quotation-document.util';

const MARGIN = 30;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN;
const CELL_PADDING = 3;
const PANEL_FILL = '#FFC000';
const TOTAL_FILL = '#92D050';
const REGULAR = 'regular';
const BOLD = 'bold';

type Align = 'left' | 'center' | 'right';

/** Column widths sum to the content width; the second column carries the descriptions. */
const COLUMNS: ReadonlyArray<{ width: number; align: Align }> = [
  { width: 24, align: 'center' },
  { width: 150, align: 'left' },
  { width: 80, align: 'center' },
  { width: 60, align: 'center' },
  { width: 34, align: 'center' },
  { width: 38, align: 'center' },
  { width: 72, align: 'right' },
  { width: 77, align: 'right' },
];

/** Writes the customer-facing quotation as an A4 PDF in the layout of the company's BG sheet. */
export function renderQuotationPdf(
  doc: QuotationDocument,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'A4',
    compress: options.compress ?? true,
    margin: MARGIN,
    font: QUOTATION_FONT_REGULAR,
    info: { Title: `Bảng chào giá ${doc.code}` },
  });
  pdf.registerFont(REGULAR, QUOTATION_FONT_REGULAR);
  pdf.registerFont(BOLD, QUOTATION_FONT_BOLD);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  let y = writeLetterhead(pdf, doc);
  y = writeParties(pdf, doc, y);
  y = writeTable(pdf, doc, y);
  writeFooter(pdf, doc, y);
  pdf.end();
  return done;
}

function centered(
  pdf: PDFKit.PDFDocument,
  text: string,
  y: number,
  font: string,
  size: number,
): number {
  pdf.font(font).fontSize(size);
  pdf.text(text, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  return pdf.y;
}

function writeLetterhead(pdf: PDFKit.PDFDocument, doc: QuotationDocument) {
  if (existsSync(QUOTATION_LOGO_PATH)) {
    pdf.image(QUOTATION_LOGO_PATH, MARGIN, MARGIN, { width: 80 });
  }
  const { letterhead } = doc;
  let y = centered(pdf, letterhead.name, MARGIN, BOLD, 14);
  y = centered(pdf, letterhead.address, y + 2, REGULAR, 9);
  y = centered(
    pdf,
    `Website: ${letterhead.website}.  MST: ${letterhead.taxCode}`,
    y + 1,
    BOLD,
    9,
  );
  y = centered(
    pdf,
    `STK: ${letterhead.bankAccounts.join('\n')}`,
    y + 1,
    REGULAR,
    8,
  );
  y = Math.max(y, MARGIN + 52) + 8;
  y = centered(pdf, 'BẢNG CHÀO GIÁ', y, BOLD, 16);
  return centered(pdf, `Số: ${doc.code}`, y + 2, BOLD, 10) + 8;
}

function writeParties(
  pdf: PDFKit.PDFDocument,
  doc: QuotationDocument,
  top: number,
): number {
  const rightX = MARGIN + 300;
  const rightWidth = CONTENT_WIDTH - 300;
  const rows: Array<[string, string]> = [
    [`Kính gửi: ${doc.customerName}`, `Ngày báo giá: ${doc.quotedOn}`],
    [`Người nhận: ${doc.recipient.name}`, `Người gửi: ${doc.sender.name}`],
    [`Điện thoại: ${doc.recipient.phone}`, `Điện thoại: ${doc.sender.phone}`],
    [`Email: ${doc.recipient.email}`, `Email: ${doc.sender.email}`],
  ];
  let y = top;
  for (const [left, right] of rows) {
    pdf.font(BOLD).fontSize(9);
    const height = Math.max(
      pdf.heightOfString(left, { width: 290 }),
      pdf.heightOfString(right, { width: rightWidth }),
    );
    pdf.text(left, MARGIN, y, { width: 290 });
    pdf.text(right, rightX, y, { width: rightWidth });
    y += height + 2;
  }
  y += 4;
  pdf.font(REGULAR).fontSize(9);
  for (const line of greetingLines(doc.letterhead.name)) {
    pdf.text(line, MARGIN, y, { width: CONTENT_WIDTH, oblique: true });
    y = pdf.y + 1;
  }
  return y + 4;
}

interface RowCell {
  text: string;
  from: number;
  to: number;
  align?: Align;
}

/** Where each cell sits and how tall the row is, measured from the text it will hold. */
function layoutRow(
  pdf: PDFKit.PDFDocument,
  cells: readonly RowCell[],
  bold?: boolean,
) {
  pdf.font(bold ? BOLD : REGULAR).fontSize(8);
  const spans = cells.map((cell) => {
    const x =
      MARGIN +
      COLUMNS.slice(0, cell.from).reduce((sum, col) => sum + col.width, 0);
    const width = COLUMNS.slice(cell.from, cell.to + 1).reduce(
      (sum, col) => sum + col.width,
      0,
    );
    return { ...cell, x, width };
  });
  const height = Math.max(
    16,
    ...spans.map(
      (span) =>
        pdf.heightOfString(span.text, {
          width: span.width - CELL_PADDING * 2,
        }) +
        CELL_PADDING * 2,
    ),
  );
  return { spans, height };
}

/** Draws one bordered row of cells (a cell may span several columns) and returns its height. */
function drawRow(
  pdf: PDFKit.PDFDocument,
  y: number,
  cells: readonly RowCell[],
  style: { bold?: boolean; fill?: string },
): number {
  const { spans, height } = layoutRow(pdf, cells, style.bold);
  for (const span of spans) {
    pdf.rect(span.x, y, span.width, height);
    if (style.fill) pdf.fillAndStroke(style.fill, '#000000');
    else pdf.stroke('#000000');
    pdf.fillColor('#000000');
    pdf.text(span.text, span.x + CELL_PADDING, y + CELL_PADDING, {
      width: span.width - CELL_PADDING * 2,
      align: span.align ?? COLUMNS[span.from].align,
    });
  }
  return height;
}

function singleCells(values: readonly string[]) {
  return values.map((text, index) => ({ text, from: index, to: index }));
}

function drawHeader(pdf: PDFKit.PDFDocument, y: number): number {
  const cells = TABLE_HEADERS.map((text, index) => ({
    text,
    from: index,
    to: index,
    align: 'center' as const,
  }));
  return y + drawRow(pdf, y, cells, { bold: true });
}

/** Header, one section per panel with its BOM, then the totals. Returns the next free y. */
function writeTable(
  pdf: PDFKit.PDFDocument,
  doc: QuotationDocument,
  top: number,
): number {
  let y = drawHeader(pdf, top);

  /**
   * Draws a row, first moving to a new page (header repeated) when the row, measured from its
   * own text, would run past the bottom, so a row and its borders never straddle two pages.
   */
  const place = (
    cells: readonly RowCell[],
    style: { bold?: boolean; fill?: string },
  ): void => {
    if (y + layoutRow(pdf, cells, style.bold).height > PAGE_BOTTOM) {
      pdf.addPage();
      y = drawHeader(pdf, MARGIN);
    }
    y += drawRow(pdf, y, cells, style);
  };

  for (const panel of doc.panels) {
    place(
      singleCells([
        panel.numeral,
        panel.title,
        '',
        '',
        '',
        String(panel.quantity),
        formatVnd(panel.unitPrice),
        formatVnd(panel.amount),
      ]),
      { bold: true, fill: PANEL_FILL },
    );
    for (const bom of panel.bomLines) {
      place(
        singleCells([
          '',
          bom.description,
          bom.code,
          bom.brand,
          bom.unit,
          String(bom.quantity),
          '',
          '',
        ]),
        {},
      );
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
    place(
      [
        { text: label, from: 4, to: 5, align: 'center' },
        { text: formatVnd(amount), from: 6, to: 7, align: 'center' },
      ],
      { bold: true, fill: TOTAL_FILL },
    );
  }
  return y;
}

function writeFooter(
  pdf: PDFKit.PDFDocument,
  doc: QuotationDocument,
  afterTable: number,
): void {
  let y = afterTable + 10;
  if (y + 80 > PAGE_BOTTOM) {
    pdf.addPage();
    y = MARGIN;
  }
  pdf.font(BOLD).fontSize(9).text('Ghi chú:', MARGIN, y);
  y = pdf.y + 2;
  pdf.font(REGULAR).fontSize(8.5);
  doc.terms.forEach((term, index) => {
    if (y + 12 > PAGE_BOTTOM) {
      pdf.addPage();
      y = MARGIN;
      pdf.font(REGULAR).fontSize(8.5);
    }
    pdf.text(`${index + 1}. ${term}`, MARGIN + 6, y, {
      width: CONTENT_WIDTH - 6,
      oblique: true,
    });
    y = pdf.y + 1;
  });

  y += 12;
  if (y + 40 > PAGE_BOTTOM) {
    pdf.addPage();
    y = MARGIN;
  }
  pdf
    .font(BOLD)
    .fontSize(9)
    .text('Xác nhận đặt hàng', MARGIN + 40, y, { width: 200, align: 'center' });
  pdf.text(doc.placeAndDate, MARGIN + 300, y, { width: CONTENT_WIDTH - 300 });
}
