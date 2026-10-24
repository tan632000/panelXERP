import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';

import type { EntityManager } from 'typeorm';

const manager = {} as EntityManager;

describe('CustomerOwnerChangeRegistry', () => {
  it('does nothing while no handler is registered', async () => {
    await expect(
      new CustomerOwnerChangeRegistry().apply(manager, 1, 2),
    ).resolves.toBeUndefined();
  });

  it('runs every handler in order with the caller manager, customer and new owner', async () => {
    const registry = new CustomerOwnerChangeRegistry();
    const calls: string[] = [];
    registry.register('request', (m, customerId, ownerId) => {
      expect(m).toBe(manager);
      calls.push(`request:${customerId}:${ownerId}`);
      return Promise.resolve();
    });
    registry.register('order', () => {
      calls.push('order');
      return Promise.resolve();
    });

    await registry.apply(manager, 5, 9);

    expect(calls).toEqual(['request:5:9', 'order']);
  });

  it('stops at the first failing handler and reports its error', async () => {
    const registry = new CustomerOwnerChangeRegistry();
    const later = jest.fn();
    registry.register('request', () => Promise.reject(new Error('boom')));
    registry.register('order', later);

    await expect(registry.apply(manager, 1, 2)).rejects.toThrow('boom');
    expect(later).not.toHaveBeenCalled();
  });

  it('rejects a second handler under the same name', () => {
    const registry = new CustomerOwnerChangeRegistry();
    registry.register('request', () => Promise.resolve());
    expect(() => registry.register('request', () => Promise.resolve())).toThrow(
      'already registered',
    );
  });
});
