import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ItemStockSettingsService } from '@plugins/catalog/item/services/item-stock-settings.service';
import { Location } from '@plugins/catalog/location/entities/location.entity';
import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Item } from '@plugins/catalog/item/entities/item.entity';

const STOREKEEPER: AuthUserPayload = { userId: 41, role: 'storekeeper' };

type ItemRow = Item & FakeRow;
type LocationRow = Location & FakeRow;

function build() {
  const items = new FakeRepo<ItemRow>({
    unique: [
      {
        constraint: 'uq_items_barcode_active',
        collides: (a, b) =>
          !!a.barcode && a.barcode.toLowerCase() === b.barcode?.toLowerCase(),
      },
    ],
  });
  const locations = new FakeRepo<LocationRow>();
  // The write reads both tables through the transaction manager, which hands out a repo per entity.
  items.manager.transaction = ((work: (manager: unknown) => unknown) =>
    work({
      getRepository: (target: unknown) =>
        target === Location ? locations : items,
      query: items.query,
    })) as never;
  const service = new ItemStockSettingsService(
    items as never,
    locations as never,
  );
  const item = (code: string, extra: Partial<ItemRow> = {}): ItemRow =>
    items.seed({ code, name: code, unit: 'pcs', ...extra } as never);
  const location = (
    code: string,
    extra: Partial<LocationRow> = {},
  ): LocationRow =>
    locations.seed({ code, name: code, isActive: true, ...extra } as never);
  return { service, items, locations, item, location };
}

describe('ItemStockSettingsService', () => {
  describe('resolve', () => {
    it('finds an item by barcode before code and names its default location', async () => {
      const { service, item, location } = build();
      const shelf = location('A-01-02');
      item('LC1D09M7', { barcode: '8930001', defaultLocationId: shelf.id });

      await expect(service.resolve('8930001')).resolves.toMatchObject({
        code: 'LC1D09M7',
        barcode: '8930001',
        defaultLocationCode: 'A-01-02',
      });
      await expect(service.resolve('lc1d09m7')).resolves.toMatchObject({
        code: 'LC1D09M7',
      });
    });

    it('answers 404 with the scanned value for an unknown or deleted item', async () => {
      const { service, item } = build();
      item('LC1D09M7', { barcode: '8930001', isDeleted: true });

      await expect(service.resolve('8930001')).rejects.toThrow(
        'No item for 8930001',
      );
      await expect(service.resolve('LC1D09M7')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('withDefaultLocations', () => {
    it('attaches the location of each item with one lookup and null where none is set', async () => {
      const { service, location } = build();
      const shelf = location('A-01-02');

      const rows = await service.withDefaultLocations([
        { id: 1, defaultLocationId: shelf.id },
        { id: 2, defaultLocationId: null },
        { id: 3 },
      ]);

      expect(rows.map((row) => row.defaultLocation?.code ?? null)).toEqual([
        'A-01-02',
        null,
        null,
      ]);
    });
  });

  it('changes only the fields sent and records the editor', async () => {
    const { service, item, location } = build();
    const shelf = location('A-01-02');
    const target = item('LC1D09M7', { barcode: 'B-1', minStock: 4 });

    const saved = await service.update(
      target.id,
      { defaultLocationId: shelf.id },
      STOREKEEPER,
    );

    expect(saved).toMatchObject({
      barcode: 'B-1',
      minStock: 4,
      defaultLocationId: shelf.id,
      updatedBy: STOREKEEPER.userId,
    });
  });

  it('trims the barcode and stores a blank one as null', async () => {
    const { service, item } = build();
    const target = item('LC1D09M7');

    await expect(
      service.update(target.id, { barcode: '  8930001 ' }, STOREKEEPER),
    ).resolves.toMatchObject({ barcode: '8930001' });
    await expect(
      service.update(target.id, { barcode: '   ' }, STOREKEEPER),
    ).resolves.toMatchObject({ barcode: null });
  });

  it('answers 409 to a barcode equal to another active item barcode or code, in any case', async () => {
    const { service, item } = build();
    item('LC1D09M7', { barcode: 'ABC-1' });
    const target = item('LC1D12M7');

    for (const barcode of ['abc-1', 'lc1d09m7']) {
      await expect(
        service.update(target.id, { barcode }, STOREKEEPER),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('accepts the item own code or own barcode as its barcode', async () => {
    const { service, item } = build();
    const target = item('LC1D09M7', { barcode: 'ABC-1' });

    await expect(
      service.update(target.id, { barcode: 'abc-1' }, STOREKEEPER),
    ).resolves.toMatchObject({ barcode: 'abc-1' });
    await expect(
      service.update(target.id, { barcode: 'LC1D09M7' }, STOREKEEPER),
    ).resolves.toMatchObject({ barcode: 'LC1D09M7' });
  });

  it('frees the barcode of a deleted item', async () => {
    const { service, item } = build();
    item('LC1D09M7', { barcode: 'ABC-1', isDeleted: true });
    const target = item('LC1D12M7');

    await expect(
      service.update(target.id, { barcode: 'ABC-1' }, STOREKEEPER),
    ).resolves.toMatchObject({ barcode: 'ABC-1' });
  });

  it('answers 409 when a concurrent write wins the barcode index', async () => {
    const { service, item, items } = build();
    item('LC1D09M7', { barcode: 'ABC-1' });
    const target = item('LC1D12M7');
    // The item loads, the pre-check sees nothing, then the index refuses the save.
    items.findOne.mockResolvedValueOnce(target);
    items.findOne.mockResolvedValueOnce(null);
    items.findOne.mockResolvedValueOnce(null);

    await expect(
      service.update(target.id, { barcode: 'abc-1' }, STOREKEEPER),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a location that is missing, deleted or inactive, and accepts clearing it', async () => {
    const { service, item, location } = build();
    const shelf = location('A-01-02');
    const target = item('LC1D09M7', { defaultLocationId: shelf.id });
    const closed = location('Z-9', { isActive: false });
    const gone = location('Z-8', { isDeleted: true });

    for (const defaultLocationId of [999, closed.id, gone.id]) {
      await expect(
        service.update(target.id, { defaultLocationId }, STOREKEEPER),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.update(target.id, { defaultLocationId: null }, STOREKEEPER),
    ).resolves.toMatchObject({ defaultLocationId: null });
  });

  it('saves the other fields of an item whose default location was deactivated since', async () => {
    const { service, item, location, locations } = build();
    const shelf = location('A-01-02');
    const target = item('LC1D09M7', { defaultLocationId: shelf.id });
    locations.rows[0].isActive = false;

    await expect(
      service.update(
        target.id,
        { defaultLocationId: shelf.id, minStock: 7 },
        STOREKEEPER,
      ),
    ).resolves.toMatchObject({ defaultLocationId: shelf.id, minStock: 7 });
    expect(locations.findOne).not.toHaveBeenCalled();
  });

  it('still refuses to switch to an inactive location', async () => {
    const { service, item, location } = build();
    const current = location('A-01-02');
    const closed = location('Z-9', { isActive: false });
    const target = item('LC1D09M7', { defaultLocationId: current.id });

    await expect(
      service.update(target.id, { defaultLocationId: closed.id }, STOREKEEPER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('locks the new location row exclusively before it points the item at it', async () => {
    const { service, item, location, locations } = build();
    const shelf = location('A-01-02');
    const target = item('LC1D09M7');

    await service.update(
      target.id,
      { defaultLocationId: shelf.id },
      STOREKEEPER,
    );

    expect(locations.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('takes the identifier lock, lower-cased, before it checks a changed barcode', async () => {
    const { service, item, items } = build();
    const target = item('LC1D09M7');

    await service.update(target.id, { barcode: 'ABC-1' }, STOREKEEPER);

    const [sql, args] = items.query.mock.calls[0] as unknown as [
      string,
      string[][],
    ];
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(args[0]).toEqual(['abc-1']);
  });

  it('takes no identifier lock when the barcode is unchanged', async () => {
    const { service, item, items } = build();
    const target = item('LC1D09M7', { barcode: 'ABC-1' });

    await service.update(
      target.id,
      { barcode: 'ABC-1', minStock: 1 },
      STOREKEEPER,
    );

    expect(items.query).not.toHaveBeenCalled();
  });

  it('stores the minimum stock, including 0, and clears it with null', async () => {
    const { service, item } = build();
    const target = item('LC1D09M7');

    await expect(
      service.update(target.id, { minStock: 0 }, STOREKEEPER),
    ).resolves.toMatchObject({ minStock: 0 });
    await expect(
      service.update(target.id, { minStock: null }, STOREKEEPER),
    ).resolves.toMatchObject({ minStock: null });
  });

  it('answers 404 for a missing or deleted item', async () => {
    const { service, item } = build();
    const gone = item('LC1D09M7', { isDeleted: true });

    for (const id of [999, gone.id]) {
      await expect(
        service.update(id, { minStock: 1 }, STOREKEEPER),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});
