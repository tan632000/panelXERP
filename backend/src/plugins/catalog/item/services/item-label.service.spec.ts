import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  ItemLabelService,
  LABEL_DOT,
  LABEL_MAX_CODE_LENGTH,
  moduleWidthFor,
} from '@plugins/catalog/item/services/item-label.service';
import { encodeCode128B } from '@plugins/catalog/item/utils/code128.util';
import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';

import type { Item } from '@plugins/catalog/item/entities/item.entity';

type ItemRow = Item & FakeRow;

/** 50 x 30 mm in PDF points. */
const LABEL_SIZE = [141.73, 85.04];

function build() {
  const items = new FakeRepo<ItemRow>();
  const service = new ItemLabelService(items as never);
  const item = (code: string, extra: Partial<ItemRow> = {}): ItemRow =>
    items.seed({
      code,
      name: `Name of ${code}`,
      unit: 'pcs',
      referencePrice: 450000,
      ...extra,
    } as never);
  return { service, items, item };
}

/** Reads the page boxes out of an uncompressed PDF: one `/MediaBox` per page object. */
function pageSizes(pdf: Buffer): number[][] {
  const text = pdf.toString('latin1');
  const pages: string[] = text.match(/\/Type \/Page\b(?!s)[\s\S]*?>>/g) ?? [];
  return pages.map((page) => {
    const box = /\/MediaBox \[([^\]]+)\]/.exec(page);
    return (box?.[1] ?? '')
      .split(/\s+/)
      .map((n) => Number(n))
      .slice(2);
  });
}

/** Whether a built-in-font string shows up in the page streams, as a literal or as hex. */
function showsText(pdf: Buffer, value: string): boolean {
  const text = pdf.toString('latin1');
  const hex = Buffer.from(value, 'latin1').toString('hex');
  return text.includes(`(${value})`) || text.toLowerCase().includes(`<${hex}>`);
}

describe('ItemLabelService', () => {
  it('writes copies x ids pages of 50 x 30 mm carrying each code', async () => {
    const { service, item } = build();
    const a = item('A-01');
    const b = item('LC1D09M7');

    const { body, fileName } = await service.render([a.id, b.id], 3, {
      compress: false,
    });

    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(fileName).toBe('item-labels.pdf');
    const sizes = pageSizes(body);
    expect(sizes).toHaveLength(6);
    sizes.forEach((size) => expect(size).toEqual(LABEL_SIZE));
    expect(showsText(body, 'A-01')).toBe(true);
    expect(showsText(body, 'LC1D09M7')).toBe(true);
  });

  it('carries no price in the document', async () => {
    const { service, item } = build();
    const { body } = await service.render([item('A-01').id], 1, {
      compress: false,
    });

    expect(body.toString('latin1')).not.toContain('450000');
  });

  it('accepts 250 ids x 2 copies and refuses 251 x 2 with 400', async () => {
    const { service, item } = build();
    const ids = Array.from({ length: 251 }, (_, n) => item(`C${n}`).id);

    const { body } = await service.render(ids.slice(0, 250), 2);
    expect(body.length).toBeGreaterThan(0);

    await expect(service.render(ids, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses copies below 1 with 400', async () => {
    const { service, item } = build();

    await expect(service.render([item('A-01').id], 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('answers 404 naming the unknown or deleted ids, and prints nothing', async () => {
    const { service, item } = build();
    const live = item('A-01');
    const gone = item('B-02', { isDeleted: true });

    await expect(service.render([live.id, gone.id, 999], 1)).rejects.toThrow(
      new NotFoundException(`Item ${gone.id}, 999 not found`),
    );
  });

  it('answers 422 when a code holds characters Code 128 cannot print', async () => {
    const { service, item } = build();
    const ok = item('A-01');
    const accented = item('Bộ-01');

    await expect(
      service.render([ok.id, accented.id], 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('truncates a long name to one line and keeps the page count', async () => {
    const { service, item } = build();
    const long = item('A-01', { name: 'Rất dài '.repeat(60) });

    const { body } = await service.render([long.id], 1, { compress: false });

    expect(pageSizes(body)).toHaveLength(1);
  });

  describe('scannable width', () => {
    it('prints a code of the longest printable length and refuses one character more with 422', async () => {
      const { service, item } = build();
      const longest = item('A'.repeat(LABEL_MAX_CODE_LENGTH));
      const tooLong = item('A'.repeat(LABEL_MAX_CODE_LENGTH + 1));

      const { body } = await service.render([longest.id], 1, {
        compress: false,
      });
      expect(pageSizes(body)).toHaveLength(1);

      await expect(service.render([tooLong.id], 1)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.render([longest.id, tooLong.id], 1)).rejects.toThrow(
        `Item code "${tooLong.code}" is too long to print as a scannable 50x30 mm label`,
      );
    });

    it('derives the longest length from the label width (28 characters)', () => {
      expect(LABEL_MAX_CODE_LENGTH).toBe(28);
    });

    it('lays a short code out in a whole number of printer dots', () => {
      const width = moduleWidthFor(
        'LC1D09M7',
        encodeCode128B('LC1D09M7').widths,
      );

      expect(width / LABEL_DOT).toBeCloseTo(Math.round(width / LABEL_DOT), 9);
      expect(width / LABEL_DOT).toBeGreaterThanOrEqual(1);
    });

    it('never goes below one dot, even for the longest printable code', () => {
      const code = 'A'.repeat(LABEL_MAX_CODE_LENGTH);

      expect(moduleWidthFor(code, encodeCode128B(code).widths)).toBeCloseTo(
        LABEL_DOT,
        9,
      );
    });
  });
});
