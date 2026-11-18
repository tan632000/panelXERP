import { NotFoundException } from '@nestjs/common';

import {
  assertUnitVisible,
  deliveryOrderScope,
} from '@plugins/delivery/_shared/utils/delivery-scope.util';

import type { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';
import type { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import type { DataScope } from '@shared/services/data-scope.service';
import type { EntityManager } from 'typeorm';

const orders = {
  ownerScopeCondition: (
    column: string,
    actor: { userId: number },
    n: number,
  ) => ({
    sql: `${column} owned by $${n}`,
    params: [actor.userId],
  }),
} as unknown as OrderProductionPort;

describe('deliveryOrderScope', () => {
  const actor = { userId: 7 };
  const scopeOf = (scope: DataScope) =>
    deliveryOrderScope(scope, actor, orders)('po.order_id');

  it.each(['all', 'material'] as const)(
    'reaches every order for %s',
    (scope) => {
      expect(scopeOf(scope)).toEqual({ sql: 'TRUE', params: [] });
    },
  );

  it('reaches the actor’s own orders for ownSales, bound from $1', () => {
    expect(scopeOf('ownSales')).toEqual({
      sql: 'po.order_id owned by $1',
      params: [7],
    });
  });

  it.each(['assignedEngineer', 'assignedTechnician'] as const)(
    'reaches nothing for %s',
    (scope) => {
      expect(scopeOf(scope)).toEqual({ sql: 'FALSE', params: [] });
    },
  );
});

describe('assertUnitVisible', () => {
  const manager = {} as EntityManager;
  const scope = () => ({ sql: 'TRUE', params: [] });
  const listUnits = jest.fn();
  const port = { listUnits } as unknown as ProductionUnitPort;

  it('asks for the one cabinet under the scope and lets it through', async () => {
    listUnits.mockResolvedValueOnce([{ unitId: 3 }]);
    await expect(
      assertUnitVisible(manager, port, scope, 3),
    ).resolves.toBeUndefined();
    expect(listUnits).toHaveBeenCalledWith(manager, {
      orderScope: scope,
      unitId: 3,
    });
  });

  it('answers 404 when the scope reaches no such cabinet', async () => {
    listUnits.mockResolvedValueOnce([]);
    await expect(
      assertUnitVisible(manager, port, scope, 3),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
