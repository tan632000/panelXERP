import { type FindOperator, In } from 'typeorm';

import type { DataScope } from '@shared/services/data-scope.service';

/**
 * The `salesOwnerId` condition a list adds for an actor's data scope, so a list never fetches
 * a row the single-record check would answer 404. Full access adds none; a scope that reaches
 * no customer (an engineer's, tied to requests, or `material`) matches nothing.
 */
export function ownerCondition(
  scope: DataScope,
  userId: number,
): { salesOwnerId?: number | FindOperator<number> } {
  switch (scope) {
    case 'all':
      return {};
    case 'ownSales':
      return { salesOwnerId: userId };
    case 'assignedEngineer':
    case 'material':
      return { salesOwnerId: In([]) };
  }
}
