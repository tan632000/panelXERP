import { In } from 'typeorm';

import { ownerCondition } from '@plugins/crm/_shared/utils/owner-scope.util';

describe('ownerCondition', () => {
  it('adds no condition for full access and the own owner for sales', () => {
    expect(ownerCondition('all', 7)).toEqual({});
    expect(ownerCondition('ownSales', 7)).toEqual({ salesOwnerId: 7 });
  });

  it('matches no customer for every scope that reaches none', () => {
    const nothing = { salesOwnerId: In([]) };
    expect(ownerCondition('assignedEngineer', 7)).toEqual(nothing);
    expect(ownerCondition('material', 7)).toEqual(nothing);
    expect(ownerCondition('assignedTechnician', 7)).toEqual(nothing);
  });
});
