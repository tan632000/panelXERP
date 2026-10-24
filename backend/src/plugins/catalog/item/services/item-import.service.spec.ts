import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { QueryFailedError } from 'typeorm';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ItemImportService } from '@plugins/catalog/item/services/item-import.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const ACTOR: AuthUserPayload = { userId: 5, role: 'purchasing' };
const FIXTURES = join(__dirname, '__fixtures__');

const fixture = (name: string) => ({
  originalname: name,
  buffer: readFileSync(join(FIXTURES, name)),
});

interface InsertedRow {
  code: string;
  name: string;
  group: string;
  referencePrice: number | null;
}

/**
 * Stands in for the database: `insert` stages rows and only a transaction callback that
 * resolves commits them, so a failing insert leaves `persisted` empty like a rollback does.
 */
function build(options: { activeCodes?: string[]; failInsert?: Error } = {}) {
  const persisted: InsertedRow[] = [];
  const insert = jest.fn(
    (_target: unknown, rows: InsertedRow[]): Promise<void> => {
      if (options.failInsert) return Promise.reject(options.failInsert);
      staged.push(...rows);
      return Promise.resolve();
    },
  );
  let staged: InsertedRow[] = [];
  const dataSource = {
    transaction: jest.fn(
      async (
        callback: (manager: { insert: typeof insert }) => Promise<void>,
      ) => {
        staged = [];
        await callback({ insert });
        persisted.push(...staged);
      },
    ),
  };
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest
      .fn()
      .mockResolvedValue((options.activeCodes ?? []).map((code) => ({ code }))),
  };
  const itemRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
  const service = new ItemImportService(dataSource as never, itemRepo as never);
  return { service, insert, persisted, dataSource, query };
}

async function workbookFile(
  rows: unknown[][],
  name = 'items.xlsx',
): Promise<{ originalname: string; buffer: Buffer }> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Items');
  rows.forEach((row) => sheet.addRow(row));
  return {
    originalname: name,
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
}

const HEADER = [
  'MÔ TẢ',
  'MÃ HÀNG',
  'HÃNG SẢN XUẤT',
  'ĐV TÍNH',
  'Đơn giá (VNĐ)',
];

describe('ItemImportService', () => {
  describe('synthetic sheet with the header on row 1', () => {
    it('creates rows 2, 3 and 5, reports row 4 (no code) and row 6 (repeat with other data)', async () => {
      const { service, persisted } = build();

      const result = await service.import(
        fixture('items-import-sample.xlsx'),
        ACTOR,
      );

      expect(result.created).toBe(3);
      expect(result.errors.map((error) => error.row)).toEqual([4, 6]);
      expect(result.errors[0]).toMatchObject({ row: 4, field: 'code' });
      expect(result.errors[1]).toMatchObject({ row: 6, field: 'code' });
      expect(persisted.map((row) => row.code)).toEqual([
        'LC1D09M7',
        'BCL63E0CG-3P040',
        '6ES7214-1AG40',
      ]);
      expect(persisted[0]).toMatchObject({
        group: 'contactor',
        referencePrice: 450000,
      });
      expect(persisted[2].referencePrice).toBeNull();
    });

    it('validates every row before inserting: one INSERT with exactly the 3 valid rows', async () => {
      // An importer that inserted as it read would have written row 5 and then tripped on
      // row 6 (or created both); the duplicate must never reach the repository.
      const { service, insert, dataSource } = build();

      await service.import(fixture('items-import-sample.xlsx'), ACTOR);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledTimes(1);
      const [target, rows] = insert.mock.calls[0];
      expect(target).toBe(Item);
      expect(rows).toHaveLength(3);
      expect(rows.filter((row) => row.code === '6ES7214-1AG40')).toHaveLength(
        1,
      );
      expect(rows.find((row) => row.code === '6ES7214-1AG40')?.name).toBe(
        'PLC S7-1200 CPU 1214C',
      );
    });
  });

  describe('quotation layout (BG.xlsx)', () => {
    it('finds the header on row 13, creates the 11 coded items and reports the 8 rows without a code', async () => {
      const { service, persisted } = build();

      const result = await service.import(fixture('BG.xlsx'), ACTOR);

      expect(result.created).toBe(11);
      expect(persisted.map((row) => row.code)).toEqual([
        '600x400x200',
        'BCL63E0CG-3P040',
        'ME-43',
        'RT 18-32X',
        'ML22-22',
        'BCL63E0CG-3P020',
        'TF62A',
        'EW-181H',
        'BCL63E0CG-3P010',
        'SC-03',
        'TR-0N(4–6)',
      ]);
      expect(result.errors.map((error) => error.row)).toEqual([
        20, 21, 25, 30, 31, 36, 38, 39,
      ]);
      expect(new Set(result.errors.map((error) => error.field))).toEqual(
        new Set(['code']),
      );
      // Section rows (14, 22), the sub-assembly (32), the part-less row (37) and the
      // totals/notes rows are skipped without an error.
      for (const skipped of [14, 22, 32, 37, 40, 41, 42, 44, 45, 51]) {
        expect(result.errors.some((error) => error.row === skipped)).toBe(
          false,
        );
      }
    });
  });

  describe('row rules', () => {
    it('reports a code already used by an active item, case-insensitively', async () => {
      const { service, persisted, query } = build({
        activeCodes: ['lc1d09m7'],
      });

      const result = await service.import(
        fixture('items-import-sample.xlsx'),
        ACTOR,
      );

      expect(result.created).toBe(2);
      expect(result.errors).toContainEqual({
        row: 2,
        field: 'code',
        reason: 'code already exists',
      });
      expect(persisted.map((row) => row.code)).not.toContain('LC1D09M7');
      expect(query.andWhere).toHaveBeenCalledWith('item.isDeleted = false');
    });

    it('rejects a bad group and a negative or non-numeric price on their own rows', async () => {
      const { service, persisted } = build();
      const file = await workbookFile([
        [...HEADER, 'NHÓM'],
        ['Good', 'A-1', 'X', 'Cái', 100, 'Cable'],
        ['Bad group', 'A-2', 'X', 'Cái', 100, 'tools'],
        ['Negative', 'A-3', 'X', 'Cái', -5, 'plc'],
        ['Text price', 'A-4', 'X', 'Cái', 'abc', 'plc'],
        ['No group', 'A-5', 'X', 'Cái', 1.5],
      ]);

      const result = await service.import(file, ACTOR);

      expect(result.created).toBe(2);
      expect(result.errors).toEqual([
        expect.objectContaining({ row: 3, field: 'group' }),
        expect.objectContaining({ row: 4, field: 'referencePrice' }),
        expect.objectContaining({ row: 5, field: 'referencePrice' }),
      ]);
      expect(persisted.map((row) => [row.code, row.group])).toEqual([
        ['A-1', 'cable'],
        ['A-5', 'other'],
      ]);
    });

    it('merges a code repeated with identical name, brand and unit without an error', async () => {
      const { service, persisted } = build();
      const file = await workbookFile([
        HEADER,
        ['Same', 'D-1', 'X', 'Cái', 10],
        ['Same', 'd-1', 'X', 'Cái', 10],
      ]);

      const result = await service.import(file, ACTOR);

      expect(result).toEqual({ created: 1, errors: [] });
      expect(persisted).toHaveLength(1);
    });

    it('skips Roman-numbered section rows and rows with neither a code nor a unit', async () => {
      const { service } = build();
      const file = await workbookFile([
        ['STT', ...HEADER],
        // The unit makes this an item row unless the Roman STT marks it as a section.
        ['I', 'PANEL ONE', null, null, 'Bộ', null],
        [null, 'Sub assembly', null, null, null, null],
        [null, 'Real item', 'R-1', 'X', 'Bộ', null],
      ]);

      await expect(service.import(file, ACTOR)).resolves.toEqual({
        created: 1,
        errors: [],
      });
    });
  });

  describe('more row rules', () => {
    it('skips a sub-assembly title merged across the description and part-number columns', async () => {
      const { service, persisted } = build();
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Items');
      sheet.addRow(['STT', ...HEADER]);
      sheet.addRow([null, 'Pump 1.5KW', null, null, null, null]);
      sheet.mergeCells('B2:E2');
      sheet.addRow([null, 'Real item', 'R-1', 'X', 'Bộ', null]);
      const file = {
        originalname: 'merged.xlsx',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      };

      await expect(service.import(file, ACTOR)).resolves.toEqual({
        created: 1,
        errors: [],
      });
      expect(persisted.map((row) => row.code)).toEqual(['R-1']);
    });

    it.each([
      ['1.500', 1500],
      ['1.500.000', 1500000],
      ['1,500,000', 1500000],
      ['12,5', 12.5],
      ['12.75', 12.75],
      ['300', 300],
    ])('reads the text price %s as %d', async (text, expected) => {
      const { service, persisted } = build();
      const file = await workbookFile([
        HEADER,
        ['Priced', 'P-1', 'X', 'Cái', text],
      ]);

      const result = await service.import(file, ACTOR);

      expect(result.errors).toEqual([]);
      expect(persisted[0].referencePrice).toBe(expected);
    });

    it.each(['0x10', '1e3', 'abc', '-5', '1.5.5', '1,2345', '12 000 x'])(
      'rejects the text price %s on its row',
      async (text) => {
        const { service } = build();
        const file = await workbookFile([
          HEADER,
          ['Priced', 'P-1', 'X', 'Cái', text],
        ]);

        const result = await service.import(file, ACTOR);

        expect(result.created).toBe(0);
        expect(result.errors).toEqual([
          expect.objectContaining({ row: 2, field: 'referencePrice' }),
        ]);
      },
    );

    it('ends the table at a code-less row whose name starts with Tổng, but keeps coded rows named Tổng', async () => {
      const { service, persisted } = build();
      const file = await workbookFile([
        HEADER,
        ['Tổng đài báo cháy', 'TD-1', 'X', 'Cái', null],
        ['Real item', 'R-1', 'X', 'Bộ', null],
        ['Tổng cộng', null, null, null, null],
        ['After the table', 'R-2', 'X', 'Bộ', null],
      ]);

      await expect(service.import(file, ACTOR)).resolves.toEqual({
        created: 2,
        errors: [],
      });
      expect(persisted.map((row) => row.code)).toEqual(['TD-1', 'R-1']);
    });

    it('also ends the table when only the unit cell of a code-less row starts with Tổng', async () => {
      const { service, persisted } = build();
      const file = await workbookFile([
        HEADER,
        ['Real item', 'R-1', 'X', 'Bộ', null],
        ['Subtotal label', null, null, 'Tổng', null],
        ['After the table', 'R-2', 'X', 'Bộ', null],
      ]);

      await expect(service.import(file, ACTOR)).resolves.toEqual({
        created: 1,
        errors: [],
      });
      expect(persisted.map((row) => row.code)).toEqual(['R-1']);
    });
  });

  describe('atomicity', () => {
    it('creates nothing when the insert fails and surfaces the failure', async () => {
      const { service, persisted } = build({
        failInsert: new Error('connection lost'),
      });

      await expect(
        service.import(fixture('items-import-sample.xlsx'), ACTOR),
      ).rejects.toThrow('connection lost');
      expect(persisted).toHaveLength(0);
    });

    it('answers 409 and creates nothing when the unique index refuses a code mid-import', async () => {
      const violation = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key value'), {
          code: '23505',
          constraint: 'uq_items_code_active',
        }),
      );
      const { service, persisted } = build({ failInsert: violation });

      await expect(
        service.import(fixture('items-import-sample.xlsx'), ACTOR),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(persisted).toHaveLength(0);
    });

    it('does not open a transaction when no row is valid', async () => {
      const { service, dataSource } = build();
      const file = await workbookFile([
        HEADER,
        ['No code', null, 'X', 'Cái', 1],
      ]);

      const result = await service.import(file, ACTOR);

      expect(result.created).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('file checks (400)', () => {
    const expectBadRequest = async (
      file: Parameters<ItemImportService['import']>[0],
    ) => {
      const { service, dataSource } = build();
      await expect(service.import(file, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    };

    it('rejects a missing file', async () => {
      await expectBadRequest(undefined);
    });

    it('rejects a file that is not named .xlsx', async () => {
      const file = await workbookFile([HEADER], 'items.csv');
      await expectBadRequest(file);
    });

    it('rejects a .xlsx name whose bytes are not a zip', async () => {
      await expectBadRequest({
        originalname: 'items.xlsx',
        buffer: Buffer.from('code,name\nA,B'),
      });
    });

    it('rejects a file over 5 MB', async () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      buffer.set([0x50, 0x4b, 0x03, 0x04]);
      await expectBadRequest({ originalname: 'big.xlsx', buffer });
    });

    it('rejects a zip whose entries unpack beyond the cap before reading any sheet', async () => {
      // 40 MB of zeros deflates to a few dozen KB: well under the upload cap, over the unpack cap.
      const zip = new JSZip();
      zip.file('xl/worksheets/sheet1.xml', Buffer.alloc(40 * 1024 * 1024));
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      expect(buffer.length).toBeLessThan(5 * 1024 * 1024);

      await expectBadRequest({ originalname: 'bomb.xlsx', buffer });
      // The unpack guard must be what refuses it: without the guard ExcelJS fails on its own
      // with "not a readable .xlsx workbook", after inflating the whole entry.
      const { service } = build();
      await expect(
        service.import({ originalname: 'bomb.xlsx', buffer }, ACTOR),
      ).rejects.toThrow('too large once unpacked');
    });

    it('rejects a sheet without the description and part-number headers', async () => {
      const file = await workbookFile([
        ['Name', 'Code'],
        ['A', 'B'],
      ]);
      await expectBadRequest(file);
    });

    it('rejects a sheet that has a header and no data rows', async () => {
      await expectBadRequest(await workbookFile([HEADER]));
    });

    it('rejects a sheet with more than 2000 data rows', async () => {
      const rows: unknown[][] = [HEADER];
      for (let i = 0; i < 2001; i += 1) {
        rows.push([`Item ${i}`, `C-${i}`, 'X', 'Cái', 1]);
      }
      await expectBadRequest(await workbookFile(rows));
    });
  });

  it('builds a template whose row 1 holds the import headers', async () => {
    const { service } = build();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await service.buildTemplate()) as unknown as ExcelJS.Buffer,
    );
    const headers = (workbook.worksheets[0].getRow(1).values as string[]).slice(
      1,
    );
    expect(headers).toEqual(
      expect.arrayContaining(['MÔ TẢ', 'MÃ HÀNG', 'ĐV TÍNH', 'NHÓM']),
    );
  });
});
