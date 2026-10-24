import { CatalogGateway } from '@plugins/catalog/_shared/gateways/catalog-gateway';
import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';

import type { Item } from '@plugins/catalog/item/entities/item.entity';

type ItemRow = Item & FakeRow;

describe('CatalogGateway', () => {
  function build() {
    const items = new FakeRepo<ItemRow>();
    // The gateway asks with `find`; the fake exposes the same visibility rules through it.
    const find = jest.fn(
      (options: {
        where: { id: { value: number[] } };
        withDeleted?: boolean;
      }) =>
        Promise.resolve(
          items.rows.filter(
            (row) =>
              options.where.id.value.includes(row.id) &&
              (options.withDeleted || !row.deletedAt),
          ),
        ),
    );
    return {
      items,
      find,
      gateway: new CatalogGateway({ find } as never),
    };
  }

  const seed = (items: FakeRepo<ItemRow>, extra: Partial<ItemRow> = {}) =>
    items.seed({
      code: 'LC1D09M7',
      name: 'Contactor 9A',
      group: 'contactor',
      unit: 'Cái',
      referencePrice: 450000,
      ...extra,
    } as Omit<ItemRow, 'id' | 'isDeleted'>);

  it('summarises live items and omits unknown ids', async () => {
    const { items, gateway } = build();
    const row = seed(items);

    await expect(gateway.getItems([row.id, 404])).resolves.toEqual([
      {
        id: row.id,
        code: 'LC1D09M7',
        name: 'Contactor 9A',
        specification: null,
        brand: null,
        group: 'contactor',
        unit: 'Cái',
        referencePrice: 450000,
        isDeleted: false,
      },
    ]);
  });

  it('still resolves a soft-deleted item, flagged as deleted', async () => {
    const { items, find, gateway } = build();
    const row = seed(items, { isDeleted: true, deletedAt: new Date() });

    const [summary] = await gateway.getItems([row.id]);

    expect(summary).toMatchObject({ id: row.id, isDeleted: true });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
  });

  it('answers an empty list for no ids without querying', async () => {
    const { find, gateway } = build();

    await expect(gateway.getItems([])).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
