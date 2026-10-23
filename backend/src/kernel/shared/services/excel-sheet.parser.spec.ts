import { EventEmitter } from 'events';
import fs from 'fs';
import { Writable } from 'stream';

import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES } from '@shared/constants/excel';
import { ExcelSheetParser } from '@shared/services/excel-sheet.parser';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';

import type { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';
import type { ExcelParseError } from '@shared/services/excel-parse.error';

const SPEC: ExcelSheetSpecDto = {
  columns: [
    { key: 'code', label: 'Mã lô' },
    { key: 'price', label: 'Đơn giá', headerGroup: ['Giá'] },
    { key: 'total', label: 'Thành tiền', headerGroup: ['Giá'] },
  ],
};

async function sheetBuffer(
  fill: (worksheet: ExcelJS.Worksheet) => void,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  fill(workbook.addWorksheet('Import'));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The grouped header the template draws, typed the way a reader might retype it. */
function groupedHeader(worksheet: ExcelJS.Worksheet): void {
  worksheet.getCell('A1').value = '  MÃ   lô ';
  worksheet.mergeCells('A1:A2');
  worksheet.getCell('B1').value = 'giá';
  worksheet.mergeCells('B1:C1');
  worksheet.getCell('B2').value = 'ĐƠN GIÁ';
  worksheet.getCell('C2').value = 'Thành  tiền';
}

async function parseError(promise: Promise<unknown>): Promise<ExcelParseError> {
  try {
    await promise;
  } catch (error) {
    return error as ExcelParseError;
  }
  throw new Error('expected the parse to fail');
}

describe('ExcelSheetParser', () => {
  const parser = new ExcelSheetParser();

  it('matches merged, retyped header labels to spec keys (R4.1)', async () => {
    const buffer = await sheetBuffer((worksheet) => {
      groupedHeader(worksheet);
      worksheet.getCell('D1').value = 'Cột thêm';
      worksheet.addRow(['L-1', 10, 20, 'ignored']);
    });

    const { rows, issues } = await parser.parse(buffer, SPEC);

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { fileRow: 3, values: { code: 'L-1', price: '10', total: '20' } },
    ]);
  });

  it('normalizes values and keeps the sheet row number (R4.2)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        { key: 'date', label: 'Ngày' },
        { key: 'qty', label: 'SL' },
        { key: 'name', label: 'Tên' },
        { key: 'link', label: 'Link' },
        { key: 'sum', label: 'Tổng' },
        { key: 'note', label: 'Ghi chú' },
      ],
    };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['Ngày', 'SL', 'Tên', 'Link', 'Tổng', 'Ghi chú']);
      worksheet.addRow([]);
      const row = worksheet.addRow([
        new Date(Date.UTC(2026, 0, 1)),
        1234.5,
        { richText: [{ text: 'Bu' }, { text: 'lông' }] },
        { text: 'site', hyperlink: 'http://x' },
        { formula: 'B3*2', result: 2469 },
        null,
      ]);
      row.getCell(2).numFmt = '#,##0.0';
    });

    const { rows } = await parser.parse(buffer, spec);

    expect(rows).toEqual([
      {
        fileRow: 3,
        values: {
          date: '2026-01-01',
          qty: '1234.5',
          name: 'Bulông',
          link: 'site',
          sum: '2469',
          note: '',
        },
      },
    ]);
  });

  it('lists every missing and duplicated column in one error (R4.3)', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên' },
        { key: 'qty', label: 'SL' },
        { key: 'unit', label: 'ĐVT' },
      ],
    };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['Mã', 'Mã', 'ĐVT']);
      worksheet.addRow(['A', 'B', 'kg']);
    });

    const error = await parseError(parser.parse(buffer, spec));

    expect(error.issues).toEqual([
      { fileRow: 1, code: 'duplicateColumn', column: 'code' },
      { fileRow: 1, code: 'missingColumns', column: 'name' },
      { fileRow: 1, code: 'missingColumns', column: 'qty' },
    ]);
  });

  it('reports every blank required column as a non-fatal issue, ignores optional blanks and fully blank rows, and still returns every row', async () => {
    const spec: ExcelSheetSpecDto = {
      columns: [
        { key: 'code', label: 'Mã', required: true },
        { key: 'name', label: 'Tên', required: true },
        { key: 'note', label: 'Ghi chú' },
      ],
    };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['Mã', 'Tên', 'Ghi chú']);
      worksheet.addRow(['A', 'B', '']);
      worksheet.addRow(['', 'C', '']);
      worksheet.addRow([]);
      worksheet.addRow(['D', '', '']);
    });

    const { rows, issues } = await parser.parse(buffer, spec);

    // A blank required cell does not stop the read: every row is returned so the caller's own
    // business validation can still run over all of them in the same pass.
    expect(rows).toEqual([
      { fileRow: 2, values: { code: 'A', name: 'B', note: '' } },
      { fileRow: 3, values: { code: '', name: 'C', note: '' } },
      { fileRow: 5, values: { code: 'D', name: '', note: '' } },
    ]);
    expect(issues).toEqual([
      { fileRow: 3, column: 'Mã', code: 'requiredMissing' },
      { fileRow: 5, column: 'Tên', code: 'requiredMissing' },
    ]);
  });

  it('rejects a file that is not an xlsx', async () => {
    const error = await parseError(
      parser.parse(Buffer.from('code,name\nA,B\n'), SPEC),
    );
    expect(error.code).toBe('invalidFile');
  });

  it('rejects a header-only sheet as emptyFile', async () => {
    const buffer = await sheetBuffer(groupedHeader);
    const error = await parseError(parser.parse(buffer, SPEC));
    expect(error.code).toBe('emptyFile');
  });

  it('stops reading past 10,000 data rows', async () => {
    const spec: ExcelSheetSpecDto = { columns: [{ key: 'a', label: 'A' }] };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['A']);
      for (let i = 0; i < 10_001; i += 1) worksheet.addRow([`v${i}`]);
    });

    const error = await parseError(parser.parse(buffer, spec));
    expect(error.code).toBe('tooManyRows');
  });

  it('accepts exactly 10,000 data rows', async () => {
    const spec: ExcelSheetSpecDto = { columns: [{ key: 'a', label: 'A' }] };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['A']);
      for (let i = 0; i < 10_000; i += 1) worksheet.addRow([`v${i}`]);
    });

    const { rows } = await parser.parse(buffer, spec);
    expect(rows).toHaveLength(10_000);
  });

  it('reads 10,001 data rows through the streaming reader as tooManyRows', async () => {
    const spec: ExcelSheetSpecDto = { columns: [{ key: 'a', label: 'A' }] };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['A']);
      for (let i = 0; i < 10_001; i += 1) worksheet.addRow([`v${i}`]);
    });

    const error = await parseError(parser.parse(buffer, spec));
    expect(error.code).toBe('tooManyRows');
  });

  it('does not hang on a sheet whose only extra cell is far below the row cap', async () => {
    const spec: ExcelSheetSpecDto = { columns: [{ key: 'a', label: 'A' }] };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['A']);
      worksheet.addRow(['v0']);
      // A single styled, valueless cell far down the sheet: a small XML payload that would
      // otherwise make an eager reader allocate a Row/Cell object for every row up to it.
      const farRow = worksheet.getRow(150_000);
      farRow.getCell(1).font = { bold: true };
      farRow.commit();
    });

    const { rows } = await parser.parse(buffer, spec);
    expect(rows).toEqual([{ fileRow: 2, values: { a: 'v0' } }]);
  }, 20_000);

  it('still matches merged group headers read through the streaming reader (R4.1)', async () => {
    const buffer = await sheetBuffer((worksheet) => {
      groupedHeader(worksheet);
      worksheet.addRow(['L-1', 10, 20]);
    });

    const { rows } = await parser.parse(buffer, SPEC);

    expect(rows).toEqual([
      { fileRow: 3, values: { code: 'L-1', price: '10', total: '20' } },
    ]);
  });

  it('round-trips a groupSpan export back through the parser (H1 regression)', async () => {
    const spec: ExcelSheetSpecDto = {
      rowGroupField: 'orderId',
      columns: [
        { key: 'code', label: 'Mã lô', groupSpan: true },
        { key: 'name', label: 'Tên NVL', headerGroup: ['Chi tiết'] },
        {
          key: 'qty',
          label: 'SL',
          headerGroup: ['Chi tiết'],
          fields: [{ field: 'qty', type: 'number' }],
        },
      ],
    };
    const sourceRows = [
      { orderId: 1, code: 'VT_1', name: 'Thép A', qty: 10 },
      { orderId: 1, code: 'VT_1', name: 'Thép B', qty: 20 },
      { orderId: 2, code: 'VT_2', name: 'Thép C', qty: 30 },
    ];
    const buffer = await new ExcelWorkbookBuilder().build(spec, sourceRows, [
      'orderId',
      'code',
      'name',
      'qty',
    ]);

    const { rows } = await parser.parse(buffer, spec);

    // The builder merges A3:A4 for the `code` groupSpan (row group 1 has two rows); the
    // covered cell at row 4 must resolve to the merge's master value, not come back blank.
    expect(rows).toEqual([
      { fileRow: 3, values: { code: 'VT_1', name: 'Thép A', qty: '10' } },
      { fileRow: 4, values: { code: 'VT_1', name: 'Thép B', qty: '20' } },
      { fileRow: 5, values: { code: 'VT_2', name: 'Thép C', qty: '30' } },
    ]);
  });

  // Excel and ExcelJS write the worksheet before the shared strings and `xl/workbook.xml` last,
  // which made the streaming reader spool the sheet to a temp file; when that write was slow
  // its unzip dependency silently dropped every later entry, `xl/workbook.xml` included, and
  // the parse failed as `invalidFile` — intermittently, on a busy CI disk.
  it('reads the sheet even when temp-file writes are slow', async () => {
    const createWriteStream: (path: string) => fs.WriteStream = (path) =>
      fs.createWriteStream(path);
    jest.spyOn(fs, 'createWriteStream').mockImplementation(((path: string) => {
      const target = createWriteStream(path);
      return new Writable({
        write(chunk: Buffer, _encoding, callback) {
          setTimeout(() => target.write(chunk, callback), 30);
        },
        final(callback) {
          target.end(callback);
        },
      });
    }) as unknown as typeof fs.createWriteStream);
    const spec: ExcelSheetSpecDto = { columns: [{ key: 'a', label: 'A' }] };
    const buffer = await sheetBuffer((worksheet) => {
      worksheet.addRow(['A']);
      worksheet.addRow(['v0']);
    });

    try {
      const { rows } = await parser.parse(buffer, spec);
      expect(rows).toEqual([{ fileRow: 2, values: { a: 'v0' } }]);
    } finally {
      jest.restoreAllMocks();
    }
  });

  describe('zip bomb guard', () => {
    /** A stream that feeds `chunks` one at a time, only once every `data` listener is attached. */
    class FakeXmlStream extends EventEmitter {
      constructor(chunks: readonly string[]) {
        super();
        setImmediate(() => {
          for (const chunk of chunks) this.emit('data', Buffer.from(chunk));
          this.emit('end');
        });
      }
    }

    /** `generateFrom` is the real workbook the rows are then streamed from, when a test reads any. */
    function fakeZip(
      entries: Record<string, { size: number; xml?: readonly string[] }>,
      generateFrom?: JSZip,
    ): JSZip {
      const files: Record<string, unknown> = {};
      for (const [path, { size, xml }] of Object.entries(entries)) {
        files[path] = {
          dir: false,
          _data: { uncompressedSize: size },
          nodeStream: () => new FakeXmlStream(xml ?? []),
        };
      }
      return {
        files,
        generateNodeStream: generateFrom
          ? (options?: JSZip.JSZipGeneratorOptions<'nodebuffer'>) =>
              generateFrom.generateNodeStream(options)
          : undefined,
      } as unknown as JSZip;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('rejects a zip whose declared size exceeds the ceiling, without reading rows', async () => {
      jest.spyOn(JSZip, 'loadAsync').mockResolvedValue(
        fakeZip({
          'xl/worksheets/sheet1.xml': {
            size: EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES + 1,
          },
        }),
      );
      const readRows = jest.spyOn(ExcelJS.stream.xlsx, 'WorkbookReader');

      const error = await parseError(
        parser.parse(Buffer.from('irrelevant'), SPEC),
      );

      expect(error.code).toBe('invalidFile');
      expect(readRows).not.toHaveBeenCalled();
    });

    it('sums every entry, refusing a zip whose combined declared size crosses the ceiling', async () => {
      const half = Math.floor(EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES / 2) + 1;
      jest.spyOn(JSZip, 'loadAsync').mockResolvedValue(
        fakeZip({
          'xl/sharedStrings.xml': { size: half },
          'xl/worksheets/sheet1.xml': { size: half },
        }),
      );

      const error = await parseError(
        parser.parse(Buffer.from('irrelevant'), SPEC),
      );

      expect(error.code).toBe('invalidFile');
    });

    it('handles a <mergeCell tag split across two chunks', async () => {
      const buffer = await sheetBuffer((worksheet) => {
        groupedHeader(worksheet);
        worksheet.addRow(['L-1', 10, 20]);
      });
      const realZip = await JSZip.loadAsync(buffer);
      jest.spyOn(JSZip, 'loadAsync').mockResolvedValue(
        fakeZip(
          {
            'xl/worksheets/sheet1.xml': {
              size: 100,
              // The second tag's closing `/>` is cut into its own chunk, exercising the carry
              // buffer that bridges a tag split across a chunk boundary.
              xml: ['<mergeCell ref="A1:A2"/><mergeCell ref="B1:C1"', '/>'],
            },
          },
          realZip,
        ),
      );

      const { rows } = await parser.parse(buffer, SPEC);

      expect(rows).toEqual([
        { fileRow: 3, values: { code: 'L-1', price: '10', total: '20' } },
      ]);
    });
  });
});
