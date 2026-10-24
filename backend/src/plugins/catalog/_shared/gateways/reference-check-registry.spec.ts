import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';

describe('ReferenceCheckRegistry', () => {
  it('reports nothing while no check is registered', async () => {
    await expect(
      new ReferenceCheckRegistry().referencingItem(1),
    ).resolves.toEqual([]);
  });

  it('names every check that reports the item as referenced', async () => {
    const registry = new ReferenceCheckRegistry();
    registry.registerItemCheck('estimate', (id) => Promise.resolve(id === 1));
    registry.registerItemCheck('order', () => Promise.resolve(false));
    registry.registerItemCheck('quotation', (id) => Promise.resolve(id === 1));

    await expect(registry.referencingItem(1)).resolves.toEqual([
      'estimate',
      'quotation',
    ]);
    await expect(registry.referencingItem(2)).resolves.toEqual([]);
  });

  it('rejects a second check under the same name', () => {
    const registry = new ReferenceCheckRegistry();
    registry.registerItemCheck('estimate', () => Promise.resolve(false));
    expect(() =>
      registry.registerItemCheck('estimate', () => Promise.resolve(true)),
    ).toThrow('already registered');
  });
});
