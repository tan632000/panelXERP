import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { UserImportService } from '@kernel/core/users/user-import.service';

interface RowError {
  fileRow: number;
  field?: string;
  code: string;
  message?: string;
}

function validRow(fileRow: number, overrides: Record<string, unknown> = {}) {
  return {
    fileRow,
    username: `user${fileRow}`,
    email: `user${fileRow}@erp.vn`,
    fullName: 'Nguyen Van A',
    roleCode: 'planner',
    ...overrides,
  };
}

function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    name: 'error',
    message: 'duplicate key',
    code: '23505',
    constraint,
  } as Error);
}

describe('UserImportService', () => {
  let service: UserImportService;
  let users: { createRecord: jest.Mock };
  let manager: { transaction: jest.Mock };
  let written: Array<{ username: string }>;
  let committed: Array<{ username: string }>;

  beforeEach(() => {
    written = [];
    committed = [];
    users = {
      createRecord: jest.fn((dto: { username: string; email: string }) => {
        // Mirrors the real identity check, which sees rows already written on the transaction.
        const clash = written.find(
          (row) => row.username.toLowerCase() === dto.username.toLowerCase(),
        );
        if (clash) {
          return Promise.reject(
            new ConflictException('Username is already in use'),
          );
        }
        written.push({ username: dto.username });
        return Promise.resolve({ id: written.length });
      }),
    };
    manager = {
      transaction: jest.fn((work: (inner: unknown) => unknown) =>
        work(manager),
      ),
    };
    // Rolls the transaction's writes back when the work throws, like the database does.
    const dataSource = {
      transaction: jest.fn(async (work: (inner: unknown) => unknown) => {
        try {
          const result = await work(manager);
          committed = [...written];
          return result;
        } catch (error) {
          written = [];
          throw error;
        }
      }),
    };
    service = new UserImportService(dataSource as never, users as never);
  });

  async function rejection(
    documents: Array<Record<string, unknown>>,
  ): Promise<RowError[]> {
    const error: unknown = await service
      .import(documents as never, 1)
      .then(() => undefined)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    return (
      (error as BadRequestException).getResponse() as { errors: RowError[] }
    ).errors;
  }

  it('creates every row through the form create on the import transaction', async () => {
    const result = await service.import(
      [
        validRow(2),
        validRow(3, { phone: '0901', department: 'planning' }),
      ] as never,
      7,
    );

    expect(result).toEqual({ created: 2, updated: 0 });
    expect(users.createRecord).toHaveBeenCalledTimes(2);
    expect(users.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'user2', roleCode: 'planner' }),
      7,
      manager,
    );
    expect(committed).toHaveLength(2);
  });

  it('reports every bad row at once and writes nothing', async () => {
    const errors = await rejection([
      validRow(2),
      validRow(3, { email: 'not-an-email' }),
      validRow(4, { username: 'bad user' }),
      validRow(5, { department: 'boardroom' }),
      validRow(6, { fullName: '' }),
    ]);

    expect(errors.map((error) => [error.fileRow, error.field])).toEqual([
      [3, 'email'],
      [4, 'username'],
      [5, 'department'],
      [6, 'fullName'],
    ]);
    expect(committed).toEqual([]);
  });

  it('rejects a payload that names a password or a status', async () => {
    const errors = await rejection([
      validRow(2, { password: 'Secret#123' }),
      validRow(3, { isActive: false }),
    ]);

    expect(errors.map((error) => [error.fileRow, error.field])).toEqual([
      [2, 'password'],
      [3, 'isActive'],
    ]);
    expect(users.createRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ password: expect.any(String) as string }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('flags a username the file repeats on its second row', async () => {
    const errors = await rejection([
      validRow(2, { username: 'planner' }),
      validRow(3, { username: 'Planner', email: 'other@erp.vn' }),
    ]);

    expect(errors).toEqual([
      expect.objectContaining({
        fileRow: 3,
        code: 'rejected',
        message: 'Username is already in use',
      }),
    ]);
    expect(committed).toEqual([]);
  });

  it('reports a username or email already stored as a row error', async () => {
    users.createRecord.mockRejectedValueOnce(
      new ConflictException('Email is already in use'),
    );

    const errors = await rejection([validRow(2)]);

    expect(errors).toEqual([
      expect.objectContaining({
        fileRow: 2,
        message: 'Email is already in use',
      }),
    ]);
  });

  it('turns a unique-index violation into a 409 row error, not a 500', async () => {
    users.createRecord
      .mockRejectedValueOnce(uniqueViolation('uq_users_username_active'))
      .mockRejectedValueOnce(uniqueViolation('uq_users_email_active'));

    const errors = await rejection([validRow(2), validRow(3)]);

    expect(errors).toEqual([
      expect.objectContaining({
        fileRow: 2,
        code: 'rejected',
        message: 'Username is already in use',
      }),
      expect.objectContaining({
        fileRow: 3,
        code: 'rejected',
        message: 'Email is already in use',
      }),
    ]);
  });

  it('lets a fault that is not a row rule surface as itself', async () => {
    users.createRecord.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.import([validRow(2)] as never, 1)).rejects.toThrow(
      'connection lost',
    );
  });

  it('refuses a document without a sheet row', async () => {
    await expect(
      service.import([{ username: 'x' }] as never, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
