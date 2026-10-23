import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';

describe('ReferenceCheckRegistry', () => {
  it('reports nothing while no check is registered', async () => {
    await expect(
      new ReferenceCheckRegistry().referencingCustomer(1),
    ).resolves.toEqual([]);
  });

  it('names every check that reports the customer as referenced', async () => {
    const registry = new ReferenceCheckRegistry();
    registry.registerCustomerCheck('project', (id) =>
      Promise.resolve(id === 1),
    );
    registry.registerCustomerCheck('order', () => Promise.resolve(false));
    registry.registerCustomerCheck('quotation', (id) =>
      Promise.resolve(id === 1),
    );

    await expect(registry.referencingCustomer(1)).resolves.toEqual([
      'project',
      'quotation',
    ]);
    await expect(registry.referencingCustomer(2)).resolves.toEqual([]);
  });

  it('rejects a second check under the same name', () => {
    const registry = new ReferenceCheckRegistry();
    registry.registerCustomerCheck('project', () => Promise.resolve(false));

    expect(() =>
      registry.registerCustomerCheck('project', () => Promise.resolve(true)),
    ).toThrow('already registered');
  });
});
