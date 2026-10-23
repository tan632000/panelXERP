import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { ExcelSheetParser } from '@shared/services/excel-sheet.parser';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';

import type { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';

async function load(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook.worksheets[0];
}

function merges(worksheet: ExcelJS.Worksheet): string[] {
  const model = worksheet.model as unknown as { merges?: string[] };
  return [...(model.merges ?? [])].sort();
}

function codeOf(error: unknown): unknown {
  return ((error as BadRequestException).getResponse() as { code?: string })
    .code;
}

const GROUPED: ExcelSheetSpecDto = {
  columns: [
    { key: 'a', label: 'Mã đơn' },
    { key: 'b', label: 'Đơn giá', headerGroup: ['Giá'] },
    { key: 'c', label: 'Thành tiền', headerGroup: ['Giá'] },
    { key: 'd', label: 'Ghi chú' },
  ],
};

describe('ExcelWorkbookBuilder', () => {
  const builder = new ExcelWorkbookBuilder();

  it('writes client labels and merges grouped headers like the table (R2.1)', async () => {
    const sheet = await load(
      await builder.build(GROUPED, [], ['a', 'b', 'c', 'd']),
    );

    expect(merges(sheet)).toEqual(['A1:A2', 'B1:C1', 'D1:D2']);
    expect(sheet.getCell('A1').value).toBe('Mã đơn');
    expect(sheet.getCell('B1').value).toBe('Giá');
    expect(sheet.getCell('B2').value).toBe('Đơn giá');
    expect(sheet.getCell('C2').value).toBe('Thành tiền');
    expect(sheet.getCell('D1').value).toBe('Ghi chú');
  });

  it('never merges a group across a column outside it', async () => {
    const sheet = await load(
      await builder.build(
        {
          columns: [
            { key: 'a', label: 'A', headerGroup: ['g'] },
            { key: 'b', label: 'B' },
            { key: 'c', label: 'C', headerGroup: ['g'] },
          ],
        },
        [],
        ['a', 'b', 'c'],
      ),
    );

    expect(sheet.getCell('A1').value).toBe('g');
    expect(sheet.getCell('C1').value).toBe('g');
    expect(merges(sheet)).toEqual(['B1:B2']);
  });

  it('merges groupSpan cells over each consecutive run only (R2.2)', async () => {
    const spec: ExcelSheetSpecDto = {
      rowGroupField: 'orderId',
      columns: [
        { key: 'orderCode', label: 'Mã', groupSpan: true },
        { key: 'line', label: 'Dòng' },
      ],
    };
    const rows = [
      { orderId: 1, orderCode: 'DV-1', line: 'x' },
      { orderId: 1, orderCode: 'DV-1', line: 'y' },
      { orderId: 1, orderCode: 'DV-1', line: 'z' },
      { orderId: 2, orderCode: 'DV-2', line: 'w' },
    ];
    const sheet = await load(
      await builder.build(spec, rows, ['orderId', 'orderCode', 'line']),
    );

    expect(merges(sheet)).toEqual(['A2:A4']);
    expect(sheet.getCell('A2').value).toBe('DV-1');
    expect(sheet.getCell('A5').value).toBe('DV-2');
    expect(sheet.getCell('B3').value).toBe('y');
  });

  it('does not join non-adjacent rows that share a group value', async () => {
    const spec: ExcelSheetSpecDto = {
      rowGroupField: 'orderId',
      columns: [{ key: 'orderCode', label: 'Mã', groupSpan: true }],
    };
    const rows = [
      { orderId: 1, orderCode: 'A' },
      { orderId: 1, orderCode: 'A' },
      { orderId: 2, orderCode: 'B' },
      { orderId: 1, orderCode: 'A' },
    ];
    const sheet = await load(
      await builder.build(spec, rows, ['orderId', 'orderCode']),
    );

    expect(merges(sheet)).toEqual(['A2:A3']);
    expect(sheet.getCell('A5').value).toBe('A');
  });

  it('writes numeric cells and unshifted calendar dates (R2.3)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        {
          key: 'quantity',
          label: 'SL',
          fields: [{ field: 'quantity', type: 'number' }],
          numberFormat: '#,##0.00',
        },
        {
          key: 'orderDate',
          label: 'Ngày',
          fields: [{ field: 'orderDate', type: 'date' }],
        },
      ],
    };
    const sheet = await load(
      await builder.build(
        spec,
        [{ quantity: '12.5', orderDate: '2026-01-01' }],
        ['quantity', 'orderDate'],
      ),
    );

    expect(sheet.getCell('A2').value).toBe(12.5);
    expect(sheet.getCell('A2').numFmt).toBe('#,##0.00');
    const date = sheet.getCell('B2').value as Date;
    expect(date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(sheet.getCell('B2').numFmt).toBe('dd/mm/yyyy');
  });

  it('drops the optional decimal section for an integer value (M7)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        {
          key: 'quantity',
          label: 'SL',
          fields: [{ field: 'quantity', type: 'number' }],
          numberFormat: '#,##0.###',
        },
      ],
    };
    const sheet = await load(
      await builder.build(spec, [{ quantity: 1234 }], ['quantity']),
    );

    expect(sheet.getCell('A2').numFmt).toBe('#,##0');
  });

  it('keeps a forced-decimal format untouched for an integer value (M7)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        {
          key: 'quantity',
          label: 'SL',
          fields: [{ field: 'quantity', type: 'number' }],
          numberFormat: '#,##0.00',
        },
      ],
    };
    const sheet = await load(
      await builder.build(spec, [{ quantity: 1234 }], ['quantity']),
    );

    expect(sheet.getCell('A2').numFmt).toBe('#,##0.00');
  });

  it('keeps the optional decimal section for a non-integer value (M7)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        {
          key: 'quantity',
          label: 'SL',
          fields: [{ field: 'quantity', type: 'number' }],
          numberFormat: '#,##0.###',
        },
      ],
    };
    const sheet = await load(
      await builder.build(spec, [{ quantity: 1234.5 }], ['quantity']),
    );

    expect(sheet.getCell('A2').numFmt).toBe('#,##0.###');
  });

  it('maps valueLabels and falls back to the stored value (R2.4)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        {
          key: 'status',
          label: 'Trạng thái',
          fields: [{ field: 'status', valueLabels: { closed: 'Đã đóng' } }],
        },
      ],
    };
    const sheet = await load(
      await builder.build(
        spec,
        [{ status: 'closed' }, { status: 'draft' }],
        ['status'],
      ),
    );

    expect(sheet.getCell('A2').value).toBe('Đã đóng');
    expect(sheet.getCell('A3').value).toBe('draft');
  });

  it('joins and coalesces multi-field columns as text (R2.5)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        {
          key: 'dateWeek',
          label: 'Ngày/Tuần',
          fields: [
            { field: 'orderDate', type: 'date' },
            { field: 'week', type: 'number' },
          ],
          joinWith: ' - ',
        },
        {
          key: 'notes',
          label: 'Ghi chú',
          fields: [{ field: 'notes' }, { field: 'orderNotes' }],
          combine: 'coalesce',
        },
      ],
    };
    const sheet = await load(
      await builder.build(
        spec,
        [{ orderDate: '2026-09-24', week: 39, notes: '', orderNotes: 'note' }],
        ['orderDate', 'week', 'notes', 'orderNotes'],
      ),
    );

    expect(sheet.getCell('A2').value).toBe('24/09/2026 - 39');
    expect(sheet.getCell('B2').value).toBe('note');
  });

  it('never stores text as a formula (R2.6)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [{ key: 'name', label: 'Tên' }],
    };
    const sheet = await load(
      await builder.build(
        spec,
        [{ name: '=1+1' }, { name: '=HYPERLINK("http://x")' }],
        ['name'],
      ),
    );

    expect(sheet.getCell('A2').value).toBe('=1+1');
    expect(sheet.getCell('A2').formula).toBeUndefined();
    expect(sheet.getCell('A3').value).toBe('=HYPERLINK("http://x")');
  });

  describe('assertSpec (R2.7)', () => {
    const column = { key: 'a', label: 'A' };

    it('rejects a field outside the allowlist', () => {
      expect.assertions(2);
      try {
        builder.assertSpec(
          {
            columns: [
              { key: 'a', label: 'A', fields: [{ field: 'customerId' }] },
            ],
          },
          ['a'],
        );
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(codeOf(error)).toBe('unknownField');
      }
    });

    it.each([
      ['no columns', { columns: [] }],
      [
        '101 columns',
        {
          columns: Array.from({ length: 101 }, (_, i) => ({
            key: `c${i}`,
            label: `C${i}`,
          })),
        },
      ],
      [
        'a 4-level group',
        { columns: [{ ...column, headerGroup: ['1', '2', '3', '4'] }] },
      ],
      ['an undeclared property', { columns: [{ ...column, formula: '=1' }] }],
      ['a non-boolean required', { columns: [{ ...column, required: 'yes' }] }],
    ])(
      'rejects %s with invalidSpec and builds nothing',
      async (_name, spec) => {
        await expect(
          builder.build(spec as ExcelSheetSpecDto, [], ['a']),
        ).rejects.toMatchObject({ response: { code: 'invalidSpec' } });
      },
    );

    it('accepts a spec with required columns', () => {
      expect(() =>
        builder.assertSpec({ columns: [{ ...column, required: true }] }, ['a']),
      ).not.toThrow();
    });
  });

  it('marks exactly the required leaf headers with fill/bold and keeps labels/merges unchanged', async () => {
    const required: ExcelSheetSpecDto = {
      columns: GROUPED.columns.map((column) =>
        column.key === 'a' || column.key === 'c'
          ? { ...column, required: true }
          : column,
      ),
    };

    const plain = await load(await builder.buildTemplate(GROUPED));
    const withRequired = await load(await builder.buildTemplate(required));

    expect(merges(withRequired)).toEqual(merges(plain));
    GROUPED.columns.forEach((column, index) => {
      const leafRow = (column.headerGroup?.length ?? 0) + 1;
      const plainCell = plain.getCell(leafRow, index + 1);
      const requiredCell = withRequired.getCell(leafRow, index + 1);
      expect(requiredCell.value).toBe(plainCell.value);
      expect(requiredCell.font?.bold).toBe(true);
    });

    const fillOf = (row: number, col: number) =>
      (
        withRequired.getCell(row, col).fill as
          { fgColor?: { argb?: string } } | undefined
      )?.fgColor?.argb;

    expect(fillOf(1, 1)).toBe('FFFFF2CC'); // a (required)
    expect(fillOf(2, 3)).toBe('FFFFF2CC'); // c (required)
    expect(fillOf(2, 2)).toBeUndefined(); // b (not required)
    expect(fillOf(1, 4)).toBeUndefined(); // d (not required)
  });

  it('builds a template that parses back with no header error (R5.2)', async () => {
    const template = await builder.buildTemplate(GROUPED);

    await expect(
      new ExcelSheetParser().parse(template, GROUPED),
    ).rejects.toMatchObject({
      code: 'emptyFile',
    });
  });

  it('reports write progress at most once per percent', async () => {
    const calls: number[] = [];
    const rows = Array.from({ length: 1000 }, (_, i) => ({ a: String(i) }));
    await builder.build(
      { columns: [{ key: 'a', label: 'A' }] },
      rows,
      ['a'],
      (done) => calls.push(done),
    );

    // One call per whole percent, 0 through 100 inclusive.
    expect(calls.length).toBe(101);
    expect(calls[calls.length - 1]).toBe(1000);
  });
});

describe('ExcelWorkbookBuilder.buildSheets', () => {
  const builder = new ExcelWorkbookBuilder();

  it('writes one worksheet per input, in order, each with its own header', async () => {
    const buffer = await builder.buildSheets([
      {
        sheet: { columns: [{ key: 'code', label: 'Mã' }], sheetName: 'Một' },
        rows: [{ code: 'A' }],
        allowedFields: ['code'],
      },
      {
        sheet: { columns: [{ key: 'qty', label: 'SL' }] },
        rows: [{ qty: 'B' }],
        allowedFields: ['qty'],
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Một',
      'Sheet2',
    ]);
    expect(workbook.worksheets[0].getCell('A1').value).toBe('Mã');
    expect(workbook.worksheets[1].getCell('A2').value).toBe('B');
  });

  it('refuses two worksheets sharing a name', async () => {
    const sheet = { columns: [{ key: 'code', label: 'Mã' }], sheetName: 'X' };
    await expect(
      builder.buildSheets([
        { sheet, rows: [], allowedFields: ['code'] },
        { sheet, rows: [], allowedFields: ['code'] },
      ]),
    ).rejects.toMatchObject({ response: { code: 'invalidSpec' } });
  });

  it('checks every worksheet against its own allowlist', async () => {
    await expect(
      builder.buildSheets([
        {
          sheet: { columns: [{ key: 'qty', label: 'SL' }] },
          rows: [],
          allowedFields: ['code'],
        },
      ]),
    ).rejects.toMatchObject({ response: { code: 'unknownField' } });
  });
});
