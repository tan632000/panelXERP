import {
  buildLineScopedMatch,
  LINE_SCOPE_ALIAS,
  narrowDocumentLines,
  type LineScope,
} from '@shared/utils/line-scoped-filter.util';

import type { ColumnFilterMap } from '@shared/utils/column-filter.util';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';

const SCOPE: LineScope = {
  headerTable: 'receipts',
  table: 'receipt_lines',
  foreignKey: 'receipt_id',
  where: 'is_deleted = false',
};

const MAP: ColumnFilterMap = {
  receiptNo: { field: 'receiptNo' },
  materialCode: {
    matchWithExists: {
      table: 'receipt_lines',
      foreignKey: 'receipt_id',
      column: 'material_code',
      where: 'is_deleted = false',
    },
  },
  supplier: {
    matchWithExists: {
      table: 'receipt_lines',
      foreignKey: 'receipt_id',
      where: 'is_deleted = false',
      joins: [
        { table: 'companies', alias: 'c', on: 'c.id = related.supplier_id' },
      ],
      sources: [{ from: { alias: 'c', column: 'name' } }],
    },
  },
  otherTable: {
    matchWithExists: {
      table: 'receipt_attachments',
      foreignKey: 'receipt_id',
      column: 'name',
    },
  },
};

function recordingQb() {
  const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
  const qb: { andWhere: jest.Mock } = { andWhere: jest.fn() };
  qb.andWhere.mockImplementation(
    (sql: string, params?: Record<string, unknown>) => {
      calls.push({ sql, params });
      return qb;
    },
  );
  return { qb: qb as unknown as SelectQueryBuilder<object>, calls };
}

describe('buildLineScopedMatch', () => {
  it('is inactive without a line-level condition, so every line is drawn', async () => {
    const match = buildLineScopedMatch(SCOPE, MAP, {
      receiptNo: ['PNK-1'],
      otherTable: ['x'],
    });
    const { qb, calls } = recordingQb();

    match.applyToDocuments(qb, 'receipt');
    match.applyToLines(qb, 'l');

    expect(match.active).toBe(false);
    expect(calls).toHaveLength(0);
    await expect(
      match.findLineIds({} as EntityManager, 'receipt', [1]),
    ).resolves.toBeUndefined();
  });

  it('requires one line to meet every line filter together', () => {
    const match = buildLineScopedMatch(
      SCOPE,
      MAP,
      { materialCode: ['VT-1', ''], supplier: ['ACME'] },
      [
        {
          sql: `${LINE_SCOPE_ALIAS}.status = :status`,
          params: { status: 'ok' },
        },
      ],
    );
    const { qb, calls } = recordingQb();

    match.applyToDocuments(qb, 'receipt');

    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0];
    // A single line EXISTS carries every condition, so two filters cannot be met by two lines.
    expect(sql.match(/FROM receipt_lines scoped_line/g)).toHaveLength(1);
    expect(sql).toContain('scoped_line.receipt_id = receipt.id');
    expect(sql).toContain('scoped_line.is_deleted = false');
    expect(sql).toContain('related.id = scoped_line.id');
    expect(sql).toContain(
      'LEFT JOIN companies c ON c.id = related.supplier_id',
    );
    expect(sql).toContain('scoped_line.status = :status');
    expect(params).toEqual({
      lineScope_materialCode: ['VT-1', ''],
      lineScope_supplier: ['ACME'],
      status: 'ok',
    });
  });

  it('narrows a line query by correlating to its own line alias', () => {
    const match = buildLineScopedMatch(SCOPE, MAP, { materialCode: ['VT-1'] });
    const { qb, calls } = recordingQb();

    match.applyToLines(qb, 'l');

    expect(calls[0].sql).toContain('scoped_line.id = l.id');
  });

  it('reads the matching line ids of the given documents', async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ id: '4' }, { id: 11 }]),
    };
    const manager = {
      createQueryBuilder: () => builder,
    } as unknown as EntityManager;
    const match = buildLineScopedMatch(SCOPE, MAP, { materialCode: ['VT-1'] });

    const ids = await match.findLineIds(manager, 'receipt', [4, 6]);

    expect(ids).toEqual(new Set([4, 11]));
    expect(builder.innerJoin).toHaveBeenCalledWith(
      'receipts',
      'receipt',
      'receipt.id = scoped_line.receipt_id',
    );
    expect(builder.where).toHaveBeenCalledWith(
      expect.stringContaining('IN (:...lineScopeDocumentIds)'),
      { lineScopeDocumentIds: [4, 6] },
    );
  });
});

describe('narrowDocumentLines', () => {
  const documents = [
    { id: 1, lines: [{ id: 10 }, { id: 11 }] },
    { id: 2, lines: [{ id: 20 }] },
  ];

  it('keeps every line when no line condition is active', () => {
    expect(narrowDocumentLines(documents, undefined)).toBe(documents);
  });

  it('keeps only the matched lines of each document', () => {
    expect(narrowDocumentLines(documents, new Set([11, 20]))).toEqual([
      { id: 1, lines: [{ id: 11 }] },
      { id: 2, lines: [{ id: 20 }] },
    ]);
  });
});
