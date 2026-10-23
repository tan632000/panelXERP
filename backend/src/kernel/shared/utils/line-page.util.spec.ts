import {
  findDocumentPage,
  findDocumentPagedLineIds,
  findLinePage,
} from '@shared/utils/line-page.util';

import type { LineScopedMatch } from '@shared/utils/line-scoped-filter.util';

/** A query builder that records the SQL it was asked to run and answers fixed rows. */
function fakeQueryBuilder(documentRows: unknown[], counts: unknown) {
  const qb: Record<string, jest.Mock> & { connection?: unknown } = {};
  for (const name of [
    'clone',
    'orderBy',
    'offset',
    'limit',
    'skip',
    'take',
    'innerJoin',
    'select',
    'addSelect',
    'addOrderBy',
  ]) {
    qb[name] = jest.fn(() => qb);
  }
  qb.getQuery = jest.fn(() => 'SELECT documents');
  qb.getParameters = jest.fn(() => ({ docParam: 1 }));
  qb.getRawMany = jest.fn(() => Promise.resolve(documentRows));
  qb.getRawOne = jest.fn(() => Promise.resolve(counts));
  qb.expressionMap = { mainAlias: undefined } as never;
  return qb;
}

describe('findLinePage with a union', () => {
  const match = { applyToLines: jest.fn() } as unknown as LineScopedMatch;

  it('pages the union in SQL and sums both sources into the totals', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*) AS lines')) {
        return Promise.resolve([{ lines: '3', documents: '2' }]);
      }
      return Promise.resolve([
        { lineId: '5', documentId: '2', source: null },
        { lineId: '9', documentId: '4', source: 'ok' },
      ]);
    });
    const connection = {
      query,
      driver: {
        escapeQueryWithParameters: (sql: string, params: object) => [
          sql,
          Object.values(params),
        ],
      },
    };
    const documents = fakeQueryBuilder([], { lines: '4', documents: '3' });
    documents.connection = connection;

    const page = await findLinePage({
      documents: documents as never,
      listAlias: 'doc',
      scope: {
        headerTable: 'docs',
        table: 'doc_lines',
        foreignKey: 'doc_id',
        where: 'is_deleted = false',
      },
      match,
      map: {},
      query: {},
      fallback: { sql: 'doc.receipt_date', direction: 'DESC' },
      lineOrder: 'line_index',
      skip: 10,
      take: 5,
      union: {
        rowsSql: 'SELECT auto rows',
        countSql: 'SELECT COUNT(*) AS lines, 1 AS documents',
        params: { tsAutoX: 1 },
      },
    });

    const rowsSql = query.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => sql.includes('UNION ALL')) as string;
    expect(rowsSql).toContain('SELECT documents UNION ALL SELECT auto rows');
    expect(rowsSql).toContain('NULLS LAST');
    expect(rowsSql).toContain('LIMIT 5 OFFSET 10');
    expect(page.totalLines).toBe(7);
    expect(page.totalDocuments).toBe(5);
    expect(page.rows).toEqual([
      { lineId: 5, documentId: 2, source: null },
      { lineId: 9, documentId: 4, source: 'ok' },
    ]);
  });
});

/** A connection whose raw query records the SQL and answers the given rows. */
function fakeConnection(rows: unknown[]) {
  const query = jest.fn(() => Promise.resolve(rows));
  return {
    query,
    connection: {
      query,
      driver: {
        escapeQueryWithParameters: (sql: string, params: object) => [
          sql,
          Object.values(params),
        ],
      },
    },
  };
}

describe('findLinePage pages by document', () => {
  const match = { applyToLines: jest.fn() } as unknown as LineScopedMatch;

  it('ranks lines, cuts whole documents and keeps each document together', async () => {
    const { query, connection } = fakeConnection([
      { lineId: '7', documentId: '3', source: null },
      { lineId: '8', documentId: '3', source: null },
      { lineId: '2', documentId: '1', source: null },
    ]);
    const documents = fakeQueryBuilder([], { lines: '40', documents: '9' });
    documents.connection = connection;

    const page = await findLinePage({
      documents: documents as never,
      listAlias: 'doc',
      scope: {
        headerTable: 'docs',
        table: 'doc_lines',
        foreignKey: 'doc_id',
        where: 'is_deleted = false',
      },
      match,
      map: {},
      query: {},
      fallback: { sql: 'doc.receipt_date', direction: 'DESC' },
      lineOrder: 'line_index',
      tieBreak: 'doc.receipt_no',
      skip: 25,
      take: 25,
    });

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY');
    expect(sql).toContain('u.doc_tie DESC');
    // The window is cut over documents, not lines.
    expect(sql).toMatch(
      /GROUP BY r\."documentId", r\."source"\s+ORDER BY first_rn LIMIT 25 OFFSET 25/,
    );
    expect(sql).toContain('ORDER BY p.first_rn, r.rn');
    expect(documents.addSelect).toHaveBeenCalledWith(
      'doc.receipt_no',
      'doc_tie',
    );
    expect(page.rows.map((row) => row.lineId)).toEqual([7, 8, 2]);
    expect(page.totalLines).toBe(40);
    expect(page.totalDocuments).toBe(9);
  });
});

describe('findDocumentPagedLineIds', () => {
  it('pages documents by the rank of their first line under the list order', async () => {
    const { query, connection } = fakeConnection([
      { lineId: '4' },
      { lineId: '5' },
      { lineId: '1' },
    ]);
    const lines = fakeQueryBuilder([], {});
    lines.connection = connection;
    lines.getQuery = jest.fn(() => 'SELECT ranked lines');

    const ids = await findDocumentPagedLineIds({
      lines: lines as never,
      lineId: 'line.id',
      documentId: 'header.id',
      order: [
        { sql: 'line.material_code', direction: 'ASC', nulls: 'NULLS LAST' },
        { sql: 'line.id', direction: 'ASC' },
      ],
      skip: 0,
      take: 2,
    });

    expect(lines.addSelect).toHaveBeenCalledWith(
      'ROW_NUMBER() OVER (ORDER BY line.material_code ASC NULLS LAST, line.id ASC)',
      'rn',
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('WITH ranked AS (SELECT ranked lines)');
    expect(sql).toMatch(
      /GROUP BY r\."documentId"\s+ORDER BY first_rn LIMIT 2 OFFSET 0/,
    );
    expect(ids).toEqual([4, 5, 1]);
  });

  it('reads every document when unpaged', async () => {
    const { query, connection } = fakeConnection([]);
    const lines = fakeQueryBuilder([], {});
    lines.connection = connection;

    await findDocumentPagedLineIds({
      lines: lines as never,
      lineId: 'line.id',
      documentId: 'header.id',
      order: [{ sql: 'line.id', direction: 'ASC' }],
    });

    expect(query.mock.calls[0][0]).not.toContain('LIMIT');
  });
});

describe('findDocumentPage', () => {
  it('orders by the query own ORDER BY and returns the page lines in that order', async () => {
    const { connection } = fakeConnection([{ lineId: '12' }, { lineId: '10' }]);
    const lines = fakeQueryBuilder([], { lines: '30', documents: '11' });
    lines.connection = connection;
    lines.expressionMap = {
      orderBys: {
        list_sort: { order: 'DESC', nulls: 'NULLS LAST' },
        'line.id': 'ASC',
      },
      selects: [{ selection: 'header.receipt_date', aliasName: 'list_sort' }],
    } as never;
    lines.andWhere = jest.fn(() => lines);
    lines.getMany = jest.fn(() => Promise.resolve([{ id: 10 }, { id: 12 }]));

    const page = await findDocumentPage(lines as never, {
      lineAlias: 'line',
      documentId: 'header.id',
      skip: 0,
      take: 25,
    });

    // The selected sort alias is read as its expression, since the paged read reselects.
    expect(lines.addSelect).toHaveBeenCalledWith(
      'ROW_NUMBER() OVER (ORDER BY header.receipt_date DESC NULLS LAST, line.id ASC)',
      'rn',
    );
    expect(lines.andWhere).toHaveBeenCalledWith(
      'line.id IN (:...documentPageLineIds)',
      { documentPageLineIds: [12, 10] },
    );
    expect(page.lines).toEqual([{ id: 12 }, { id: 10 }]);
    expect(page.totalLines).toBe(30);
    expect(page.totalDocuments).toBe(11);
  });
});
