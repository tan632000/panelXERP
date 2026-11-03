import { NotFoundException } from '@nestjs/common';

import { RequestContextStore } from '@shared/context/request-context.store';
import {
  DataScopeService,
  materialListCondition,
  NO_OWNER_ID,
} from '@shared/services/data-scope.service';

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
    expect(scopeOf('purchasing')).toBe('material');
    expect(scopeOf('storekeeper')).toBe('material');
    expect(scopeOf('sales')).toBe('ownSales');
    expect(scopeOf('engineer')).toBe('assignedEngineer');
    expect(scopeOf('productionManager')).toBe('material');
    expect(scopeOf('technician')).toBe('assignedTechnician');
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

  it('hides every sales-chain record from the material scope', () => {
    for (const role of ['purchasing', 'storekeeper']) {
      const actor = { userId: 11, role };
      expect(service.canSee(actor, record)).toBe(false);
      expect(service.canSee(actor, { salesOwnerId: 11 })).toBe(false);
      expect(() => service.assertVisible(actor, record, 'Order')).toThrow(
        NotFoundException,
      );
    }
  });

  it('lets the material scope and full access read the materials of any order', () => {
    const other = { salesOwnerId: 99 };
    expect(
      service.canSeeMaterial({ userId: 1, role: 'storekeeper' }, other),
    ).toBe(true);
    expect(
      service.canSeeMaterial({ userId: 1, role: 'purchasing' }, other),
    ).toBe(true);
    expect(service.canSeeMaterial({ userId: 1, role: 'director' }, other)).toBe(
      true,
    );
    expect(
      service.canSeeMaterial({ userId: 1, permissions: ['*:*'] }, other),
    ).toBe(true);
  });

  it('limits the materials of a sales actor to their own orders and shows an engineer none', () => {
    expect(service.canSeeMaterial(salesA, record)).toBe(true);
    expect(service.canSeeMaterial({ ...salesA, userId: 12 }, record)).toBe(
      false,
    );
    expect(service.canSeeMaterial(salesA, { salesOwnerId: null })).toBe(false);
    expect(service.canSeeMaterial(engineerA, record)).toBe(false);
  });

  it('builds the material list condition per scope', () => {
    expect(materialListCondition('all', 5)).toEqual({});
    expect(materialListCondition('material', 5)).toEqual({});
    expect(materialListCondition('ownSales', 5)).toEqual({ salesOwnerId: 5 });
    expect(materialListCondition('assignedEngineer', 5)).toEqual({
      salesOwnerId: NO_OWNER_ID,
    });
    expect(materialListCondition('assignedTechnician', 5)).toEqual({
      salesOwnerId: NO_OWNER_ID,
    });
  });

  it('hides every sales-chain record and every material view from a technician', () => {
    const technician = { userId: 11, role: 'technician' };
    // Owning or being assigned the record by id never reaches it from the technician scope.
    expect(service.canSee(technician, record)).toBe(false);
    expect(service.canSee(technician, { salesOwnerId: 11 })).toBe(false);
    expect(service.canSee(technician, { assignedEngineerId: 11 })).toBe(false);
    expect(service.canSeeMaterial(technician, { salesOwnerId: 11 })).toBe(
      false,
    );
    expect(() => service.assertVisible(technician, record, 'Order')).toThrow(
      NotFoundException,
    );
  });

  it('lets the production manager read any order material but no sales-chain record', () => {
    const manager = { userId: 11, role: 'productionManager' };
    expect(service.canSee(manager, record)).toBe(false);
    expect(service.canSeeMaterial(manager, { salesOwnerId: 99 })).toBe(true);
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
