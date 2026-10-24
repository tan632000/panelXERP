import { randomBytes } from 'crypto';

import { ConflictException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';

import {
  createWithDocumentCode,
  salesDocumentYear,
  yearlyDocumentCode,
  type DocumentCodeFormat,
} from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { EntityManager } from 'typeorm';

function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint,
    }),
  );
}

describe('salesDocumentYear', () => {
  it('takes the year in Asia/Ho_Chi_Minh: 17:30 UTC on 31 December is already the next year', () => {
    expect(salesDocumentYear(new Date('2026-12-31T17:30:00Z'))).toBe(2027);
  });

  it('stays in the old year until midnight in Ho Chi Minh', () => {
    expect(salesDocumentYear(new Date('2026-12-31T16:59:59Z'))).toBe(2026);
    expect(salesDocumentYear(new Date('2027-01-01T00:00:00Z'))).toBe(2027);
  });
});

describe('createWithDocumentCode', () => {
  const OPTIONS = {
    table: 'sales_requests',
    prefix: 'YC',
    codeUniqueIndex: 'uq_sales_requests_code',
    exhaustedMessage: 'Could not allocate a code.',
  };

  /** A data source whose transactions run `work` against a manager answering `query`. */
  function fakeSource(highestCode: string | null) {
    const query = jest.fn(() =>
      Promise.resolve(highestCode ? [{ code: highestCode }] : []),
    );
    const manager = { query } as unknown as EntityManager;
    return {
      query,
      source: {
        transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
          work(manager),
        ),
      } as unknown as Pick<DataSource, 'transaction'>,
    };
  }

  it('numbers the first document of a year 0001, in the year at the shop (clock 2026-12-31T17:30:00Z → 2027)', async () => {
    const { source } = fakeSource(null);

    const code = await createWithDocumentCode(
      source,
      { ...OPTIONS, clock: () => new Date('2026-12-31T17:30:00Z') },
      (_manager, issued) => Promise.resolve(issued),
    );

    expect(code).toBe('YC_2027_0001');
  });

  it('reads the year from the system clock when none is injected', async () => {
    jest.useFakeTimers({
      now: new Date('2026-12-31T17:30:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
      ],
    });
    try {
      const { source } = fakeSource('YC_2027_0007');
      const code = await createWithDocumentCode(
        source,
        OPTIONS,
        (_manager, issued) => Promise.resolve(issued),
      );
      expect(code).toBe('YC_2027_0008');
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries the whole transaction on a lost race for the code, with a fresh read each time', async () => {
    const { source, query } = fakeSource('YC_2027_0004');
    const issued: string[] = [];

    const result = await createWithDocumentCode(
      source,
      { ...OPTIONS, clock: () => new Date('2027-03-01T00:00:00Z') },
      (_manager, code) => {
        issued.push(code);
        if (issued.length === 1) {
          return Promise.reject(uniqueViolation('uq_sales_requests_code'));
        }
        return Promise.resolve(code);
      },
    );

    expect(result).toBe('YC_2027_0005');
    expect(issued).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(2);
    expect(source.transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry a collision on some other unique index', async () => {
    const { source } = fakeSource(null);
    const work = jest.fn(() =>
      Promise.reject(uniqueViolation('uq_something_else')),
    );

    await expect(
      createWithDocumentCode(source, OPTIONS, work),
    ).rejects.toBeInstanceOf(QueryFailedError);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('answers 409 once every attempt lost the race', async () => {
    const { source } = fakeSource(null);
    const work = jest.fn(() =>
      Promise.reject(uniqueViolation('uq_sales_requests_code')),
    );

    await expect(
      createWithDocumentCode(source, { ...OPTIONS, maxAttempts: 3 }, work),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('builds the number through the format it is given, so another numbering fits without a rewrite', async () => {
    const { source } = fakeSource(null);
    const perDay: DocumentCodeFormat = ({ now }) =>
      Promise.resolve(`01-${now.getUTCDate()}/BG`);

    const code = await createWithDocumentCode(
      source,
      {
        ...OPTIONS,
        format: perDay,
        clock: () => new Date('2027-03-09T00:00:00Z'),
      },
      (_manager, issued) => Promise.resolve(issued),
    );

    expect(code).toBe('01-9/BG');
  });
});

describe('yearlyDocumentCode', () => {
  it('counts deleted rows as taken, so an issued number is never reused', async () => {
    const query = jest.fn(() => Promise.resolve([{ code: 'YC_2027_0009' }]));

    const code = await yearlyDocumentCode({
      manager: { query } as unknown as EntityManager,
      table: 'sales_requests',
      prefix: 'YC',
      now: new Date('2027-05-01T00:00:00Z'),
    });

    expect(code).toBe('YC_2027_0010');
    // No `is_deleted = false` condition in the read.
    expect((query.mock.calls[0] as unknown as [string])[0]).not.toContain(
      'is_deleted',
    );
  });
});

/**
 * The race itself, against the real Postgres of the compose stack: the creates all read the
 * same highest number before any of them inserts, so only the retry can give each its own.
 *
 * An unreachable database fails the suite — a green run must mean the race was exercised.
 * Setting `SKIP_DB_SPECS=1` is the one explicit opt-out, and then jest reports these as skipped.
 */
const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('createWithDocumentCode against Postgres', () => {
  const suffix = randomBytes(4).toString('hex');
  const table = `test_doc_codes_${suffix}`;
  const uniqueIndex = `uq_${table}_code`;
  const prefix = `ZZ${suffix.slice(0, 4).toUpperCase()}`;
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
    await dataSource.query(
      `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, code VARCHAR(30) NOT NULL, CONSTRAINT ${uniqueIndex} UNIQUE (code))`,
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP TABLE IF EXISTS ${table}`);
    await dataSource.destroy();
  });

  /** Holds the first `parties` callers until all have arrived; later callers pass at once. */
  function barrier(parties: number) {
    let arrived = 0;
    let release: () => void = () => undefined;
    const open = new Promise<void>((resolve) => {
      release = resolve;
    });
    return async () => {
      arrived += 1;
      if (arrived === parties) release();
      if (arrived <= parties) await open;
    };
  }

  const create = (
    source: DataSource,
    wait: () => Promise<void>,
    maxAttempts?: number,
  ) =>
    createWithDocumentCode(
      source,
      {
        table,
        prefix,
        codeUniqueIndex: uniqueIndex,
        exhaustedMessage: 'Could not allocate a code.',
        maxAttempts,
      },
      async (manager, code) => {
        await wait();
        await manager.query(`INSERT INTO ${table} (code) VALUES ($1)`, [code]);
        return code;
      },
    );

  it('gives concurrent creates distinct, consecutive codes', async () => {
    const year = salesDocumentYear(new Date());
    const wait = barrier(4);

    const codes = await Promise.all(
      Array.from({ length: 4 }, () => create(dataSource, wait)),
    );

    expect(new Set(codes).size).toBe(4);
    expect([...codes].sort()).toEqual(
      [1, 2, 3, 4].map(
        (n) => `${prefix}_${year}_${String(n).padStart(4, '0')}`,
      ),
    );
  });

  it('would hand two creates the same code without the retry (one attempt fails with 409)', async () => {
    const wait = barrier(2);

    const outcomes = await Promise.allSettled([
      create(dataSource, wait, 1),
      create(dataSource, wait, 1),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find((o) => o.status === 'rejected');
    expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
  });
});
