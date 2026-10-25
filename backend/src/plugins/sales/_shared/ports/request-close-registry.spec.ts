import { RequestCloseRegistry } from '@plugins/sales/_shared/ports/request-close-registry';

import type { EntityManager } from 'typeorm';

const manager = {} as EntityManager;
const close = { requestId: 5, reason: 'Shelved', actorId: 9 };

describe('RequestCloseRegistry', () => {
  it('does nothing while no handler is registered', async () => {
    await expect(
      new RequestCloseRegistry().apply(manager, close),
    ).resolves.toBeUndefined();
  });

  it('runs every handler in order with the caller manager and the close', async () => {
    const registry = new RequestCloseRegistry();
    const calls: string[] = [];
    registry.register('quotation', (m, received) => {
      expect(m).toBe(manager);
      calls.push(`quotation:${received.requestId}:${received.reason}`);
      return Promise.resolve();
    });
    registry.register('order', () => {
      calls.push('order');
      return Promise.resolve();
    });

    await registry.apply(manager, close);

    expect(calls).toEqual(['quotation:5:Shelved', 'order']);
  });

  it('stops at the first failing handler and reports its error', async () => {
    const registry = new RequestCloseRegistry();
    const later = jest.fn();
    registry.register('quotation', () =>
      Promise.reject(new Error('confirmed')),
    );
    registry.register('order', later);

    await expect(registry.apply(manager, close)).rejects.toThrow('confirmed');
    expect(later).not.toHaveBeenCalled();
  });

  it('rejects a second handler under the same name', () => {
    const registry = new RequestCloseRegistry();
    registry.register('quotation', () => Promise.resolve());
    expect(() =>
      registry.register('quotation', () => Promise.resolve()),
    ).toThrow('already registered');
  });
});
