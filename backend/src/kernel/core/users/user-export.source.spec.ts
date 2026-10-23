import {
  USER_EXPORT_FIELDS,
  USER_EXPORT_SOURCE,
} from '@kernel/core/users/constants/user-export.constant';
import { UserExportSource } from '@kernel/core/users/user-export.source';

describe('UserExportSource', () => {
  const users = { findAllForExport: jest.fn(), countForExport: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('registers the source key with the table-only field list', () => {
    const registry = { register: jest.fn() };
    new UserExportSource(registry as never, users as never).onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(
      USER_EXPORT_SOURCE,
      expect.objectContaining({ allowedFields: USER_EXPORT_FIELDS }),
    );
  });

  it('never allows or emits a secret field', async () => {
    for (const secret of [
      'passwordHash',
      'password',
      'refreshToken',
      'signatureUrl',
      'pendingSignatureUrl',
      'avatarUrl',
      'metadata',
    ]) {
      expect(USER_EXPORT_FIELDS).not.toContain(secret);
    }

    // A read that leaked extra columns must still not reach the sheet.
    users.findAllForExport.mockResolvedValue([
      {
        username: 'planner',
        fullName: 'Nguyen Van A',
        email: 'a@erp.vn',
        roleName: 'Planner',
        department: 'planning',
        phone: null,
        title: null,
        isActive: true,
        lastLoginAt: new Date('2026-10-14T01:05:00Z'),
        passwordHash: '$2b$10$secret',
        refreshToken: 'token',
        signatureUrl: 'signatures/1.png',
      },
    ]);
    const source = new UserExportSource(
      { register: jest.fn() } as never,
      users as never,
    );

    const [row] = await source.fetchRows({});

    expect(Object.keys(row).sort()).toEqual([...USER_EXPORT_FIELDS].sort());
    expect(JSON.stringify(row)).not.toMatch(/secret|token|signatures/);
  });

  it('writes the status key and the sign-in instant in the application offset', async () => {
    users.findAllForExport.mockResolvedValue([
      {
        username: 'a',
        fullName: 'A',
        email: 'a@erp.vn',
        roleName: null,
        department: null,
        isActive: false,
        lastLoginAt: new Date('2026-10-14T01:05:00Z'),
      },
      {
        username: 'b',
        fullName: 'B',
        email: 'b@erp.vn',
        roleName: null,
        department: null,
        isActive: true,
        lastLoginAt: null,
      },
    ]);
    const source = new UserExportSource(
      { register: jest.fn() } as never,
      users as never,
    );

    const rows = await source.fetchRows({ search: 'a' });

    expect(rows[0]).toMatchObject({
      isActive: 'false',
      lastLoginAt: '14/10/2026 08:05',
    });
    expect(rows[1]).toMatchObject({ isActive: 'true', lastLoginAt: null });
    expect(users.findAllForExport).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'a' }),
    );
  });

  it('counts with the same filter', async () => {
    users.countForExport.mockResolvedValue(3);
    const source = new UserExportSource(
      { register: jest.fn() } as never,
      users as never,
    );

    await expect(source.countRows({ roleCode: 'x' })).resolves.toBe(3);
    expect(users.countForExport).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'x' }),
    );
  });
});
