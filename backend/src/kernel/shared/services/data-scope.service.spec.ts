import { NotFoundException } from '@nestjs/common';

import { RequestContextStore } from '@shared/context/request-context.store';
import { DataScopeService } from '@shared/services/data-scope.service';

describe('DataScopeService', () => {
  const service = new DataScopeService();
  const salesA = { userId: 11, role: 'sales', permissions: ['customer:read'] };
  const engineerA = { userId: 21, role: 'engineer', permissions: [] };
  const record = { salesOwnerId: 11, assignedEngineerId: 21 };

  it('resolves the scope of every panel-shop role (D-12)', () => {
    const scopeOf = (role: string) => service.scopeOf({ userId: 1, role });
    expect(scopeOf('admin')).toBe('all');
    expect(scopeOf('director')).toBe('all');
    expect(scopeOf('salesManager')).toBe('all');
    expect(scopeOf('engineeringLead')).toBe('all');
    expect(scopeOf('purchasing')).toBe('ownSales');
    expect(scopeOf('sales')).toBe('ownSales');
    expect(scopeOf('engineer')).toBe('assignedEngineer');
  });

  it('gives full access the whole scope whatever the role code', () => {
    expect(
      service.scopeOf({ userId: 1, role: 'sales', permissions: ['*:*'] }),
    ).toBe('all');
  });

  it('falls back to the narrowest scope for an unknown or missing role', () => {
    expect(service.scopeOf({ userId: 1, role: 'intern' })).toBe('ownSales');
    expect(service.scopeOf({ userId: 1 })).toBe('ownSales');
    expect(service.canSee({ userId: 1, role: 'intern' }, record)).toBe(false);
  });

  it('shows a sales actor only the records they own', () => {
    expect(service.canSee(salesA, record)).toBe(true);
    expect(service.canSee({ ...salesA, userId: 12 }, record)).toBe(false);
    expect(service.canSee(salesA, { salesOwnerId: null })).toBe(false);
  });

  it('shows an engineer only the requests assigned to them', () => {
    expect(service.canSee(engineerA, record)).toBe(true);
    expect(service.canSee({ ...engineerA, userId: 22 }, record)).toBe(false);
    // Owning a record as sales does not reach it as an engineer.
    expect(service.canSee(engineerA, { salesOwnerId: 21 })).toBe(false);
  });

  it('answers 404, not 403, for a record outside the scope or missing', () => {
    expect(service.assertVisible(salesA, record, 'Customer')).toBe(record);
    expect(() =>
      service.assertVisible({ ...salesA, userId: 12 }, record, 'Customer'),
    ).toThrow(new NotFoundException('Customer not found'));
    expect(() => service.assertVisible(salesA, null, 'Customer')).toThrow(
      NotFoundException,
    );
  });

  it('reads the signed-in actor from the request context', () => {
    expect(service.currentActor()).toBeNull();
    RequestContextStore.run(
      { userId: 11, role: 'sales', permissions: ['customer:read'] },
      () => {
        expect(service.currentActor()).toEqual(salesA);
      },
    );
  });
});
