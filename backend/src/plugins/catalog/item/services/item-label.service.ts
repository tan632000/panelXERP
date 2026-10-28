import { join } from 'path';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { In, Repository } from 'typeorm';

import { ITEM_LABELS_MAX } from '@plugins/catalog/item/constants/item-limits.constant';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { encodeCode128B } from '@plugins/catalog/item/utils/code128.util';

/** 50 x 30 mm, the thermal roll the warehouse prints on, in PDF points. */
const LABEL_WIDTH = 141.73;
const LABEL_HEIGHT = 85.04;
const MARGIN = 6;
const QUIET_MODULES = 10;
/** One dot of a 203-dpi thermal head in points: bars are printed in whole dots, never fractions. */
export const LABEL_DOT = 72 / 203;
const MAX_MODULE_DOTS = 2;
/** Narrowest bar a head can lay down and a scanner still reads: one dot. */
const MIN_MODULE_DOTS = 1;
const LABEL_INNER_WIDTH = LABEL_WIDTH - MARGIN * 2;
/** Code 128B symbol: start, n characters, checksum (11 modules each) and the 13-module stop. */
const modulesOf = (length: number) => 11 * (length + 2) + 13;
/** Longest item code whose bars still fit one dot wide, with the quiet zones, on the label. */
export const LABEL_MAX_CODE_LENGTH = (() => {
  let length = 0;
  while (
    modulesOf(length + 1) + QUIET_MODULES * 2 <=
    Math.floor(LABEL_INNER_WIDTH / LABEL_DOT)
  ) {
    length += 1;
  }
  return length;
})();
const BARS_TOP = 17;
const BARS_HEIGHT = 40;
const NAME_SIZE = 7;
const CODE_SIZE = 9;

const NAME_FONT = 'name';
const NAME_FONT_PATH = join(
  process.cwd(),
  'assets',
  'fonts',
  'BeVietnamPro-Regular.ttf',
);
/** Codes are ASCII (Code 128B), so a built-in font reads them and no embedded subset is needed. */
const CODE_FONT = 'Helvetica-Bold';

export interface ItemLabelFile {
  fileName: string;
  body: Buffer;
}

interface Label {
  code: string;
  name: string;
}

/** Internal item labels: the item code as Code 128, readable beneath, with a one-line name. */
@Injectable()
export class ItemLabelService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  /** One page per id and copy, grouped by id in the order the ids were asked for. */
  async render(
    ids: number[],
    copies: number,
    options: { compress?: boolean } = {},
  ): Promise<ItemLabelFile> {
    const wanted = [...new Set(ids)];
    if (copies < 1 || wanted.length * copies > ITEM_LABELS_MAX) {
      throw new BadRequestException(
        `Too many labels: ids x copies is at most ${ITEM_LABELS_MAX}, and copies is at least 1.`,
      );
    }
    const found = await this.itemRepo.find({
      where: { id: In(wanted), isDeleted: false },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(found.map((item) => [item.id, item]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Item ${missing.join(', ')} not found`);
    }

    const labels: Label[] = wanted.flatMap((id) =>
      Array.from({ length: copies }, () => byId.get(id) as Label),
    );
    // Encoded before any page is written, so one unprintable code fails the whole request.
    const symbols = labels.map((label) => {
      const { widths } = encodeCode128B(label.code);
      return { widths, moduleWidth: moduleWidthFor(label.code, widths) };
    });
    return {
      fileName: 'item-labels.pdf',
      body: await renderLabelsPdf(labels, symbols, options.compress ?? true),
    };
  }
}

/**
 * The bar width for a code: as many whole dots as the label holds, at most two. A code that
 * would need less than one dot cannot be scanned, so it is refused instead of squeezed.
 */
export function moduleWidthFor(code: string, widths: number[]): number {
  const modules = widths.reduce((sum, width) => sum + width, 0);
  const dots = Math.min(
    MAX_MODULE_DOTS,
    Math.floor(LABEL_INNER_WIDTH / ((modules + QUIET_MODULES * 2) * LABEL_DOT)),
  );
  if (dots < MIN_MODULE_DOTS) {
    throw new UnprocessableEntityException(
      `Item code "${code}" is too long to print as a scannable 50x30 mm label (at most ${LABEL_MAX_CODE_LENGTH} characters).`,
    );
  }
  return dots * LABEL_DOT;
}

function renderLabelsPdf(
  labels: Label[],
  symbols: Array<{ widths: number[]; moduleWidth: number }>,
  compress: boolean,
): Promise<Buffer> {
  const pdf = new PDFDocument({
    autoFirstPage: false,
    compress,
    margin: 0,
    info: { Title: 'Item labels' },
  });
  pdf.registerFont(NAME_FONT, NAME_FONT_PATH);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  labels.forEach((label, index) => {
    pdf.addPage({ size: [LABEL_WIDTH, LABEL_HEIGHT], margin: 0 });
    drawLabel(pdf, label, symbols[index].widths, symbols[index].moduleWidth);
  });
  pdf.end();
  return done;
}

function drawLabel(
  pdf: PDFKit.PDFDocument,
  label: Label,
  widths: number[],
  moduleWidth: number,
): void {
  const inner = LABEL_INNER_WIDTH;

  pdf.font(NAME_FONT).fontSize(NAME_SIZE).fillColor('#000000');
  pdf.text(label.name, MARGIN, MARGIN, {
    width: inner,
    height: NAME_SIZE * 1.4,
    ellipsis: true,
  });

  const modules = widths.reduce((sum, width) => sum + width, 0);
  let x = (LABEL_WIDTH - modules * moduleWidth) / 2;
  widths.forEach((width, index) => {
    // Even positions are bars, odd are the spaces between them.
    if (index % 2 === 0) {
      pdf.rect(x, BARS_TOP, width * moduleWidth, BARS_HEIGHT).fill('#000000');
    }
    x += width * moduleWidth;
  });

  pdf.font(CODE_FONT).fontSize(CODE_SIZE);
  const fit = Math.min(1, inner / pdf.widthOfString(label.code));
  pdf.fontSize(CODE_SIZE * fit);
  pdf.text(label.code, MARGIN, BARS_TOP + BARS_HEIGHT + 4, {
    width: inner,
    align: 'center',
    lineBreak: false,
  });
}
