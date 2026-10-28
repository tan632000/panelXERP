import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { LocationService } from '@plugins/catalog/location/services/location.service';
import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { CreateLocationDto } from '@plugins/catalog/location/dto/create-location.dto';
import type { Location } from '@plugins/catalog/location/entities/location.entity';

const STOREKEEPER: AuthUserPayload = { userId: 41, role: 'storekeeper' };

type LocationRow = Location & FakeRow;
type ItemRow = Item & FakeRow;

function buildService() {
  const locations = new FakeRepo<LocationRow>({
    unique: [
      {
        constraint: 'uq_locations_code_active',
        collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
      },
    ],
  });
  const items = new FakeRepo<ItemRow>();
  // The delete reads and writes through the transaction manager, which hands out one repo per entity.
  locations.manager.transaction = ((work: (manager: unknown) => unknown) =>
    work({
      getRepository: (target: unknown) => (target === Item ? items : locations),
    })) as never;
  const service = new LocationService(locations as never);
  return { service, locations, items };
}

function dto(overrides: Partial<CreateLocationDto> = {}): CreateLocationDto {
  return { code: 'A-01-02', name: 'Shelf A1', ...overrides };
}

describe('LocationService', () => {
  describe('code uniqueness', () => {
    it('answers 409 when an active location has the code in a different case', async () => {
      const { service } = buildService();
      await service.create(dto(), STOREKEEPER);

      await expect(
        service.create(dto({ code: 'a-01-02', name: 'Other' }), STOREKEEPER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 409 when a concurrent create wins the unique index', async () => {
      const { service, locations } = buildService();
      locations.rows.push({
        id: 99,
        code: 'A-01-02',
        name: 'Raced',
        isActive: true,
        isDeleted: false,
      } as LocationRow);
      locations.findOne.mockResolvedValueOnce(null);

      await expect(service.create(dto(), STOREKEEPER)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lets a soft-deleted location code be used again', async () => {
      const { service } = buildService();
      const first = await service.create(dto(), STOREKEEPER);
      await service.remove(first.id, STOREKEEPER);

      const reused = await service.create(dto({ name: 'Again' }), STOREKEEPER);

      expect(reused.code).toBe('A-01-02');
      expect(reused.id).not.toBe(first.id);
    });

    it('refuses to re-code a location onto another active code, in any case', async () => {
      const { service } = buildService();
      await service.create(dto({ code: 'A-01-01' }), STOREKEEPER);
      const second = await service.create(
        dto({ code: 'A-01-02', name: 'Beta' }),
        STOREKEEPER,
      );

      await expect(
        service.update(second.id, { code: 'a-01-01' }, STOREKEEPER),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('delete', () => {
    it('answers 409 and keeps the row while an active item has it as default', async () => {
      const { service, locations, items } = buildService();
      const created = await service.create(dto(), STOREKEEPER);
      items.seed({ defaultLocationId: created.id } as never);

      await expect(
        service.remove(created.id, STOREKEEPER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(locations.rows[0].isDeleted).toBe(false);
    });

    it('locks the location row exclusively before it looks for items using it', async () => {
      const { service, locations, items } = buildService();
      const created = await service.create(dto(), STOREKEEPER);

      await service.remove(created.id, STOREKEEPER);

      expect(locations.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(items.exists).toHaveBeenCalled();
    });

    it('ignores a deleted item that still names the location, and hides the row afterwards', async () => {
      const { service, items } = buildService();
      const created = await service.create(dto(), STOREKEEPER);
      items.seed({ defaultLocationId: created.id, isDeleted: true } as never);

      await expect(service.remove(created.id, STOREKEEPER)).resolves.toEqual({
        id: created.id,
      });
      await expect(service.findOne(created.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reports the referenced row as failed in a bulk delete and deletes the rest', async () => {
      const { service, items } = buildService();
      const used = await service.create(dto({ code: 'A-01-01' }), STOREKEEPER);
      const free = await service.create(
        dto({ code: 'A-01-02', name: 'Beta' }),
        STOREKEEPER,
      );
      items.seed({ defaultLocationId: used.id } as never);

      const result = await service.removeMany([used.id, free.id], STOREKEEPER);

      expect(result.deleted).toEqual([free.id]);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('fields', () => {
    it('defaults a new location to active and trims the text', async () => {
      const { service } = buildService();

      const created = await service.create(
        dto({ code: ' A-01-02 ', note: '  ' }),
        STOREKEEPER,
      );

      expect(created).toMatchObject({
        code: 'A-01-02',
        note: null,
        isActive: true,
        createdBy: STOREKEEPER.userId,
      });
    });

    it('clears the note sent as null, deactivates, and rejects a null or blank name', async () => {
      const { service } = buildService();
      const created = await service.create(
        dto({ note: 'Top shelf' }),
        STOREKEEPER,
      );

      const updated = await service.update(
        created.id,
        { note: null, isActive: false } as never,
        STOREKEEPER,
      );
      expect(updated.note).toBeNull();
      expect(updated.isActive).toBe(false);

      for (const name of [null, '', '   ']) {
        await expect(
          service.update(created.id, { name } as never, STOREKEEPER),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });
});
