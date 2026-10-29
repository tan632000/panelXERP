import { Logger } from '@nestjs/common';

import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';

import type { EntityManager } from 'typeorm';

const manager = {} as EntityManager;
const event = { orderId: 7, actorId: 3 };

describe('OrderLifecycleRegistry', () => {
  it('runs the hooks in registration order and hands each its own result after the commit', async () => {
    const registry = new OrderLifecycleRegistry();
    const calls: string[] = [];
    const followUps: unknown[] = [];
    registry.register('first', {
      onCreated: () => {
        calls.push('first');
        return Promise.resolve({ changedOrderIds: [7], touchedItemIds: [1] });
      },
      afterCommit: (result) => {
        followUps.push(['first', result]);
        return Promise.resolve();
      },
    });
    registry.register('second', {
      onCreated: () => {
        calls.push('second');
        return Promise.resolve({ changedOrderIds: [7, 9], touchedItemIds: [] });
      },
      afterCommit: (result) => {
        followUps.push(['second', result]);
        return Promise.resolve();
      },
    });

    const pending = await registry.created(manager, event);
    expect(calls).toEqual(['first', 'second']);
    // Nothing follows up before the caller says the transaction committed.
    expect(followUps).toEqual([]);

    await pending.afterCommit();
    expect(followUps).toEqual([
      ['first', { changedOrderIds: [7], touchedItemIds: [1] }],
      ['second', { changedOrderIds: [7, 9], touchedItemIds: [] }],
    ]);
  });

  it('lets a failing hook abort the caller, and runs no follow-up for it', async () => {
    const registry = new OrderLifecycleRegistry();
    const afterCommit = jest.fn(() => Promise.resolve());
    registry.register('stock', {
      onCancelled: () => Promise.reject(new Error('Stock refused')),
      afterCommit,
    });

    await expect(registry.cancelled(manager, event)).rejects.toThrow(
      'Stock refused',
    );
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('logs a failed follow-up instead of throwing: the order is already committed', async () => {
    const registry = new OrderLifecycleRegistry();
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const later = jest.fn(() => Promise.resolve());
    registry.register('broken', {
      onCreated: () =>
        Promise.resolve({ changedOrderIds: [], touchedItemIds: [] }),
      afterCommit: () => Promise.reject(new Error('Bell down')),
    });
    registry.register('later', {
      onCreated: () =>
        Promise.resolve({ changedOrderIds: [], touchedItemIds: [] }),
      afterCommit: later,
    });

    const pending = await registry.created(manager, event);
    await expect(pending.afterCommit()).resolves.toBeUndefined();
    expect(later).toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('skips a registration without the hook being run', async () => {
    const registry = new OrderLifecycleRegistry();
    registry.register('cancel-only', {
      onCancelled: () =>
        Promise.resolve({ changedOrderIds: [7], touchedItemIds: [] }),
    });
    await expect(
      (await registry.created(manager, event)).afterCommit(),
    ).resolves.toBeUndefined();
  });

  it('refuses a second registration under one name', () => {
    const registry = new OrderLifecycleRegistry();
    registry.register('stock', {});
    expect(() => registry.register('stock', {})).toThrow('already registered');
  });
});
