import { NO_OWNER_ID } from '@shared/services/data-scope.service';

import { requestScopeCondition } from '@plugins/sales/_shared/utils/request-scope.util';

describe('requestScopeCondition', () => {
  it('reaches every request, the own ones or the assigned ones per scope', () => {
    expect(requestScopeCondition('all', 7)).toEqual({});
    expect(requestScopeCondition('ownSales', 7)).toEqual({ salesOwnerId: 7 });
    expect(requestScopeCondition('assignedEngineer', 7)).toEqual({
      assignedEngineerId: 7,
    });
  });

  it('matches no request for the material and technician scopes', () => {
    const nothing = { salesOwnerId: NO_OWNER_ID };
    expect(requestScopeCondition('material', 7)).toEqual(nothing);
    expect(requestScopeCondition('assignedTechnician', 7)).toEqual(nothing);
  });
});
