import { FindOperator, QueryFailedError } from 'typeorm';

/**
 * In-memory stand-in for a TypeORM repository, enough for the CRM services: it evaluates the
 * equality, `In`, case-insensitive-`Raw` and nested-relation conditions they build, hides
 * soft-removed rows the way `find*` does, and enforces the partial unique indexes the
 * migrations create. Named `*-spec.ts` so the production build leaves it out.
 */
export interface FakeRow {
  id?: number;
  isDeleted: boolean;
  deletedAt?: Date | null;
}

type Where = Record<string, unknown>;

function matchesField(actual: unknown, condition: unknown): boolean {
  if (condition instanceof FindOperator) {
    if (condition.type === 'in') {
      return (condition.value as unknown[]).includes(actual);
    }
    if (condition.type === 'not') return !matchesField(actual, condition.value);
    if (condition.type === 'raw') {
      const parameters = condition.objectLiteralParameters as { value: string };
      return (
        typeof actual === 'string' &&
        actual.toLowerCase() === parameters.value.toLowerCase()
      );
    }
    throw new Error(`FakeRepo cannot evaluate a "${condition.type}" condition`);
  }
  if (condition !== null && typeof condition === 'object') {
    return matchesWhere(actual as Where | undefined, condition as Where);
  }
  return actual === condition;
}

export function matchesWhere(
  row: Where | undefined,
  where: Where | Where[],
): boolean {
  if (Array.isArray(where)) return where.some((w) => matchesWhere(row, w));
  if (!row) return false;
  return Object.entries(where).every(([key, condition]) =>
    matchesField(row[key], condition),
  );
}

export interface UniqueRule<T> {
  constraint: string;
  /** True when `incoming` may not coexist with `existing` (both already known to be active). */
  collides: (existing: T, incoming: T) => boolean;
}

interface FindOptions {
  where?: Where | Where[];
  withDeleted?: boolean;
  skip?: number;
  take?: number;
}

export class FakeRepo<T extends FakeRow> {
  rows: T[] = [];
  private nextId = 1;

  constructor(
    private readonly options: {
      unique?: Array<UniqueRule<T>>;
      /** Relations a row exposes to nested `where` conditions and `relations: {...}` reads. */
      join?: (row: T) => Where;
    } = {},
  ) {}

  /** Adds a row as if it had been saved earlier. */
  seed(data: Omit<T, 'id' | 'isDeleted'> & Partial<FakeRow>): T {
    const row = {
      isDeleted: false,
      ...data,
      id: this.nextId++,
    } as unknown as T;
    this.rows.push(row);
    return row;
  }

  create = (data: Partial<T>): T => ({ isDeleted: false, ...data }) as T;

  save = jest.fn((entity: T): Promise<T> => {
    const active = !entity.isDeleted && !entity.deletedAt;
    if (active) {
      for (const rule of this.options.unique ?? []) {
        const clash = this.rows.some(
          (other) =>
            other !== entity &&
            !other.isDeleted &&
            !other.deletedAt &&
            rule.collides(other, entity),
        );
        if (clash) {
          return Promise.reject(
            new QueryFailedError(
              'INSERT',
              [],
              Object.assign(new Error('duplicate key value'), {
                code: '23505',
                constraint: rule.constraint,
              }),
            ),
          );
        }
      }
    }
    if (entity.id === undefined) {
      entity.id = this.nextId++;
      this.rows.push(entity);
    }
    return Promise.resolve(entity);
  });

  softRemove = jest.fn((entity: T): Promise<T> => {
    entity.deletedAt = new Date();
    return Promise.resolve(entity);
  });

  findOne = jest.fn((options: FindOptions): Promise<T | null> => {
    return Promise.resolve(this.visible(options)[0] ?? null);
  });

  /** Mirrors `repo.manager.transaction`: work on this repo that rolls back when it throws. */
  manager = {
    transaction: async <R>(
      work: (manager: { getRepository: () => FakeRepo<T> }) => Promise<R>,
    ): Promise<R> => {
      const snapshot = this.rows.map((row) => ({ ...row }));
      try {
        return await work({ getRepository: () => this });
      } catch (error) {
        this.rows = snapshot;
        throw error;
      }
    },
  };

  find = jest.fn((options: FindOptions): Promise<T[]> => {
    const all = this.visible(options);
    const start = options.skip ?? 0;
    const end = options.take === undefined ? undefined : start + options.take;
    return Promise.resolve(all.slice(start, end));
  });

  exists = jest.fn((options: FindOptions): Promise<boolean> => {
    return Promise.resolve(this.visible(options).length > 0);
  });

  findAndCount = jest.fn((options: FindOptions): Promise<[T[], number]> => {
    const all = this.visible(options);
    const start = options.skip ?? 0;
    const end = options.take === undefined ? undefined : start + options.take;
    return Promise.resolve([all.slice(start, end), all.length]);
  });

  /** Rows the options match, with the configured relations attached. */
  private visible(options: FindOptions): T[] {
    return this.rows
      .filter((row) => options.withDeleted || !row.deletedAt)
      .map((row) => ({ ...row, ...this.options.join?.(row) }))
      .filter((row) => !options.where || matchesWhere(row, options.where))
      .map((row) => {
        // Hand back the stored instance so a service mutating it persists like an ORM entity.
        const stored = this.rows.find((candidate) => candidate.id === row.id);
        return stored
          ? Object.assign(stored, this.options.join?.(stored))
          : row;
      });
  }

  /** Mirrors `EntityManager.update(Target, where, set)` for the demotion of a primary contact. */
  update = jest.fn(
    (_target: unknown, where: Where, set: Partial<T>): Promise<void> => {
      for (const row of this.rows) {
        if (matchesWhere(row as unknown as Where, where)) {
          Object.assign(row, set);
        }
      }
      return Promise.resolve();
    },
  );
}
