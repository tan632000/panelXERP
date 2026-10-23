import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserListPreference } from '@kernel/core/users/entities/list-preference.entity';
import { LIST_PREFERENCE_MODULE_KEYS } from '@kernel/core/users/list-preference.constant';
import { ListPreferenceService } from '@kernel/core/users/list-preference.service';

describe('ListPreferenceService', () => {
  let service: ListPreferenceService;
  let rows: UserListPreference[];

  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rows = [];

    repo.findOne.mockImplementation(
      ({ where }: { where: { userId: number; moduleKey: string } }) =>
        Promise.resolve(
          rows.find(
            (row) =>
              row.userId === where.userId && row.moduleKey === where.moduleKey,
          ) ?? null,
        ),
    );
    repo.create.mockImplementation(
      (data: Partial<UserListPreference>) =>
        ({ ...data }) as UserListPreference,
    );
    repo.save.mockImplementation((row: UserListPreference) => {
      const existing = rows.findIndex(
        (candidate) =>
          candidate.userId === row.userId &&
          candidate.moduleKey === row.moduleKey,
      );
      if (existing >= 0) rows[existing] = row;
      else rows.push(row);
      return Promise.resolve(row);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListPreferenceService,
        {
          provide: getRepositoryToken(UserListPreference),
          useValue: repo,
        },
      ],
    }).compile();
    service = module.get(ListPreferenceService);
  });

  it('returns null when the caller has never stored a choice (R8.2)', async () => {
    await expect(service.findForUser(1, 'user_list_v2')).resolves.toBeNull();
  });

  it("returns only the calling user's row (R8.2)", async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b']);
    await service.upsertForUser(2, 'user_list_v2', ['c']);

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['a', 'b'],
      frozenColumn: null,
      columnWidths: {},
    });
    await expect(service.findForUser(2, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['c'],
      frozenColumn: null,
      columnWidths: {},
    });
  });

  it('upserts rather than inserting a second row for the same pair (R8.1)', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a']);
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b']);

    expect(rows).toHaveLength(1);
    expect(rows[0].visibleColumns).toEqual(['a', 'b']);
  });

  it('writes the token user, never a user named in the payload (R8.3)', async () => {
    // The service takes `userId` as its own argument; the payload only ever carries columns,
    // so there is no path by which a request could redirect the write.
    await service.upsertForUser(1, 'user_list_v2', ['a']);

    expect(rows[0].userId).toBe(1);
    await expect(service.findForUser(2, 'user_list_v2')).resolves.toBeNull();
  });

  it('rejects a module key outside the registry with nothing stored (R8.4)', async () => {
    await expect(
      service.upsertForUser(1, 'not_a_list_v2', ['a']),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.findForUser(1, 'not_a_list_v2'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(rows).toHaveLength(0);
  });

  it.each([
    ['a string', 'not-an-array'],
    ['a number in the array', ['a', 2]],
    ['an object in the array', [{ key: 'a' }]],
    ['undefined', undefined],
  ])('rejects %s as visibleColumns (R8.4)', async (_label, value) => {
    await expect(
      service.upsertForUser(1, 'user_list_v2', value),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('accepts an empty selection, which is not the same as unset (R8.2)', async () => {
    await service.upsertForUser(1, 'user_list_v2', []);

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: [],
      frozenColumn: null,
      columnWidths: {},
    });
  });

  it('stores the frozen column alongside the visibility choice', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b'], 'a');

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['a', 'b'],
      frozenColumn: 'a',
      columnWidths: {},
    });
  });

  it('keeps the stored frozen column when a write omits the field', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b'], 'a');
    await service.upsertForUser(1, 'user_list_v2', ['a']);

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['a'],
      frozenColumn: 'a',
      columnWidths: {},
    });
  });

  it('unfreezes when the write sends null', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b'], 'a');
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b'], null);

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['a', 'b'],
      frozenColumn: null,
      columnWidths: {},
    });
  });

  it.each([
    ['a number', 7],
    ['an object', { key: 'a' }],
    ['a key longer than the column allows', 'x'.repeat(101)],
  ])('rejects %s as frozenColumn', async (_label, value) => {
    await expect(
      service.upsertForUser(1, 'user_list_v2', ['a'], value),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the dragged column widths rounded up to whole pixels', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b'], null, {
      a: 120.4,
      b: 96,
    });

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['a', 'b'],
      frozenColumn: null,
      columnWidths: { a: 121, b: 96 },
    });
  });

  it('keeps the stored widths when a write omits the field', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a', 'b'], null, {
      a: 120,
    });
    await service.upsertForUser(1, 'user_list_v2', ['a']);

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toMatchObject(
      {
        visibleColumns: ['a'],
        columnWidths: { a: 120 },
      },
    );
  });

  it('resets to the declared widths when the write sends an empty map', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['a'], null, { a: 120 });
    await service.upsertForUser(1, 'user_list_v2', ['a'], null, {});

    const stored = await service.findForUser(1, 'user_list_v2');
    expect(stored?.columnWidths).toEqual({});
  });

  it.each([
    ['null', null],
    ['an array', [120]],
    ['a non-numeric width', { a: '120' }],
    ['a zero width', { a: 0 }],
    ['a width over the ceiling', { a: 4001 }],
    ['an infinite width', { a: Infinity }],
    ['a key longer than a column key', { ['x'.repeat(101)]: 120 }],
  ])('rejects %s as columnWidths', async (_label, value) => {
    await expect(
      service.upsertForUser(1, 'user_list_v2', ['a'], null, value),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('stores widths under a picker key derived from its columns', async () => {
    await service.upsertForUser(1, 'picker_1x2k9a', ['a'], null, { a: 90 });

    await expect(
      service.findForUser(1, 'picker_1x2k9a'),
    ).resolves.toMatchObject({
      columnWidths: { a: 90 },
    });
  });

  it.each([
    ['picker_'],
    ['picker_UPPER'],
    ['picker_1x2k9a_extra'],
    ['pickerx'],
  ])('rejects %s as a picker key', async (moduleKey) => {
    await expect(
      service.upsertForUser(1, moduleKey, ['a']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registers user_list_v2 as a known module key', () => {
    expect(LIST_PREFERENCE_MODULE_KEYS).toContain('user_list_v2');
  });

  it('registers role_list_v2 as a known module key', () => {
    expect(LIST_PREFERENCE_MODULE_KEYS).toContain('role_list_v2');
  });

  it('stores and reads a role_list choice for the caller alone', async () => {
    await expect(service.findForUser(1, 'role_list_v2')).resolves.toBeNull();

    await service.upsertForUser(1, 'role_list_v2', ['status', 'currency']);
    await service.upsertForUser(2, 'role_list_v2', ['ver']);

    await expect(service.findForUser(1, 'role_list_v2')).resolves.toEqual({
      moduleKey: 'role_list_v2',
      visibleColumns: ['status', 'currency'],
      frozenColumn: null,
      columnWidths: {},
    });
    await expect(service.findForUser(2, 'role_list_v2')).resolves.toEqual({
      moduleKey: 'role_list_v2',
      visibleColumns: ['ver'],
      frozenColumn: null,
      columnWidths: {},
    });
  });

  it('keeps a stored empty role_list choice distinct from unset', async () => {
    // Hiding every column is a choice; never having chosen is not.
    await service.upsertForUser(1, 'role_list_v2', []);

    await expect(service.findForUser(1, 'role_list_v2')).resolves.toEqual({
      moduleKey: 'role_list_v2',
      visibleColumns: [],
      frozenColumn: null,
      columnWidths: {},
    });
    await expect(service.findForUser(2, 'role_list_v2')).resolves.toBeNull();
  });

  it('stores sidebar pins per account, so each user sees only their own', async () => {
    await service.upsertForUser(1, 'sidebar_pins', [
      '/warehouse/raw-material',
      '/sales/order',
    ]);

    await expect(service.findForUser(1, 'sidebar_pins')).resolves.toEqual({
      moduleKey: 'sidebar_pins',
      visibleColumns: ['/warehouse/raw-material', '/sales/order'],
      frozenColumn: null,
      columnWidths: {},
    });
    await expect(service.findForUser(2, 'sidebar_pins')).resolves.toBeNull();
  });

  it('keeps the two list choices independent', async () => {
    await service.upsertForUser(1, 'user_list_v2', ['ver']);
    await service.upsertForUser(1, 'role_list_v2', ['status']);

    await expect(service.findForUser(1, 'user_list_v2')).resolves.toEqual({
      moduleKey: 'user_list_v2',
      visibleColumns: ['ver'],
      frozenColumn: null,
      columnWidths: {},
    });
    await expect(service.findForUser(1, 'role_list_v2')).resolves.toEqual({
      moduleKey: 'role_list_v2',
      visibleColumns: ['status'],
      frozenColumn: null,
      columnWidths: {},
    });
  });
});
