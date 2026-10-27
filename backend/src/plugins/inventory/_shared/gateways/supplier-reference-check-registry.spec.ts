import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';

describe('SupplierReferenceCheckRegistry', () => {
  it('reports nothing while no check is registered', async () => {
    await expect(
      new SupplierReferenceCheckRegistry().referencing(1),
    ).resolves.toEqual([]);
  });

  it('names every check that reports the supplier as referenced', async () => {
    const registry = new SupplierReferenceCheckRegistry();
    registry.register('purchase-order', (id) => Promise.resolve(id === 1));
    registry.register('other', () => Promise.resolve(false));

    await expect(registry.referencing(1)).resolves.toEqual(['purchase-order']);
    await expect(registry.referencing(2)).resolves.toEqual([]);
  });

  it('rejects a second check under the same name', () => {
    const registry = new SupplierReferenceCheckRegistry();
    registry.register('purchase-order', () => Promise.resolve(false));

    expect(() =>
      registry.register('purchase-order', () => Promise.resolve(true)),
    ).toThrow('already registered');
  });
});
