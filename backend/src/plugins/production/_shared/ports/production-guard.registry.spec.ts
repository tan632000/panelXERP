import { ConflictException } from '@nestjs/common';

import { ProductionGuardRegistry } from '@plugins/production/_shared/ports/production-guard.registry';

import type { EntityManager } from 'typeorm';

describe('ProductionGuardRegistry', () => {
  const manager = {} as EntityManager;

  it('resolves when no guard is registered', async () => {
    const registry = new ProductionGuardRegistry();
    await expect(
      registry.beforeFinishingUndo(manager, 1),
    ).resolves.toBeUndefined();
    await expect(registry.beforeCancel(manager, 1)).resolves.toBeUndefined();
  });

  it('refuses a second registration under one name', () => {
    const registry = new ProductionGuardRegistry();
    registry.register('qc', {});
    expect(() => registry.register('qc', {})).toThrow(
      'Production guard "qc" is already registered',
    );
  });

  it('runs every guard in registration order with the arguments it was called with', async () => {
    const registry = new ProductionGuardRegistry();
    const calls: string[] = [];
    registry.register('first', {
      beforeFinishingUndo: (_manager, unitId) => {
        calls.push(`first undo ${unitId}`);
        return Promise.resolve();
      },
      beforeCancel: (_manager, id) => {
        calls.push(`first cancel ${id}`);
        return Promise.resolve();
      },
    });
    // A guard may implement only one of the two hooks.
    registry.register('second', {
      beforeCancel: (_manager, id) => {
        calls.push(`second cancel ${id}`);
        return Promise.resolve();
      },
    });

    await registry.beforeFinishingUndo(manager, 7);
    await registry.beforeCancel(manager, 9);

    expect(calls).toEqual([
      'first undo 7',
      'first cancel 9',
      'second cancel 9',
    ]);
  });

  it('stops at the first guard that throws and lets its error through', async () => {
    const registry = new ProductionGuardRegistry();
    const later = jest.fn(() => Promise.resolve());
    registry.register('veto', {
      beforeCancel: () => Promise.reject(new ConflictException('on a note')),
    });
    registry.register('later', { beforeCancel: later });

    await expect(registry.beforeCancel(manager, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(later).not.toHaveBeenCalled();
  });
});
