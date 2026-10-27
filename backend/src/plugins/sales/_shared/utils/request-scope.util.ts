import {
  type DataScope,
  NO_OWNER_ID,
} from '@shared/services/data-scope.service';

/**
 * The owner condition a request list adds for an actor's data scope, so a list never fetches
 * a row the single-record check would answer 404: a Sales actor reads the requests they own,
 * an Engineer the requests assigned to them, the `material` scope none, everyone else all of them.
 */
export function requestScopeCondition(
  scope: DataScope,
  userId: number,
): { salesOwnerId?: number; assignedEngineerId?: number } {
  switch (scope) {
    case 'all':
      return {};
    case 'ownSales':
      return { salesOwnerId: userId };
    case 'assignedEngineer':
      return { assignedEngineerId: userId };
    case 'material':
      return { salesOwnerId: NO_OWNER_ID };
  }
}
