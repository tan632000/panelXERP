import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { ItemService } from '@plugins/catalog/item/services/item.service';
import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { CreateItemDto } from '@plugins/catalog/item/dto/create-item.dto';
import type { Item } from '@plugins/catalog/item/entities/item.entity';

const PURCHASING: AuthUserPayload = { userId: 40, role: 'purchasing' };

type ItemRow = Item & FakeRow;

function buildService() {
  const items = new FakeRepo<ItemRow>({
    unique: [
      {
        constraint: 'uq_items_code_active',
        collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
      },
    ],
  });
  const registry = new ReferenceCheckRegistry();
  return {
    service: new ItemService(items as never, registry),
    items,
    registry,
  };
}

function dto(overrides: Partial<CreateItemDto> = {}): CreateItemDto {
  return {
    code: 'LC1D09M7',
    name: 'Contactor 9A',
    group: 'contactor',
    unit: 'Cái',
    ...overrides,
  };
}

describe('ItemService', () => {
  it('stores trimmed text, null for blank optionals and the audit owner', async () => {
    const { service } = buildService();

    const item = await service.create(
      dto({ code: '  LC1D09M7 ', name: ' Contactor ', brand: '  ', note: '' }),
      PURCHASING,
    );

    expect(item).toMatchObject({
      code: 'LC1D09M7',
      name: 'Contactor',
      brand: null,
      note: null,
      referencePrice: null,
      createdBy: 40,
    });
  });

  it('answers 409 to a duplicate active code in any case', async () => {
    const { service } = buildService();
    await service.create(dto(), PURCHASING);

    await expect(
      service.create(dto({ code: 'lc1d09m7' }), PURCHASING),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 409 when a concurrent create wins the unique index', async () => {
    const { service, items } = buildService();
    // The pre-check sees nothing; the index then refuses the insert.
    items.rows.push({
      id: 99,
      code: 'LC1D09M7',
      name: 'Raced',
      isDeleted: false,
    } as ItemRow);
    items.findOne.mockResolvedValueOnce(null);

    await expect(service.create(dto(), PURCHASING)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lets a soft-deleted item’s code be used again', async () => {
    const { service } = buildService();
    const first = await service.create(dto(), PURCHASING);
    await service.remove(first.id, PURCHASING);

    await expect(service.create(dto(), PURCHASING)).resolves.toMatchObject({
      code: 'LC1D09M7',
    });
  });

  it('refuses to change the code but accepts it echoed back', async () => {
    const { service } = buildService();
    const item = await service.create(dto(), PURCHASING);

    await expect(
      service.update(item.id, { code: 'OTHER' }, PURCHASING),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(item.id, { code: 'LC1D09M7', unit: 'Bộ' }, PURCHASING),
    ).resolves.toMatchObject({ unit: 'Bộ', updatedBy: 40 });
  });

  it('clears optional fields on null and refuses a blank name', async () => {
    const { service } = buildService();
    const item = await service.create(
      dto({ brand: 'Schneider', referencePrice: 100 }),
      PURCHASING,
    );

    await expect(
      service.update(
        item.id,
        { brand: null as never, referencePrice: null },
        PURCHASING,
      ),
    ).resolves.toMatchObject({ brand: null, referencePrice: null });
    await expect(
      service.update(item.id, { name: '  ' }, PURCHASING),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to delete a referenced item and reports it per row in a bulk delete', async () => {
    const { service, registry, items } = buildService();
    const used = await service.create(dto(), PURCHASING);
    const free = await service.create(dto({ code: 'FREE-1' }), PURCHASING);
    registry.registerItemCheck('estimate', (id) =>
      Promise.resolve(id === used.id),
    );

    await expect(service.remove(used.id, PURCHASING)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const result = await service.removeMany([used.id, free.id], PURCHASING);

    expect(result.deleted).toEqual([free.id]);
    expect(result.failed).toHaveLength(1);
    expect(
      items.rows.find((row) => row.id === used.id)?.deletedAt,
    ).toBeUndefined();
  });

  it('answers 404 for a missing item', async () => {
    const { service } = buildService();

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
