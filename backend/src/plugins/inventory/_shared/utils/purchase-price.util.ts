import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';

import { PURCHASE_PRICE_READ } from '@plugins/inventory/_shared/permissions/purchase-price.permissions';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

export function canReadPurchasePrice(actor: AuthUserPayload): boolean {
  return matchesPermission(actor.permissions ?? [], PURCHASE_PRICE_READ);
}

/**
 * The row without its cost keys unless the actor may read purchase prices. The keys are
 * dropped, not nulled: a storekeeper must not learn that a cost exists.
 */
export function withoutCosts<T extends object, K extends keyof T>(
  row: T,
  costKeys: readonly K[],
  actor: AuthUserPayload,
): T | Omit<T, K> {
  if (canReadPurchasePrice(actor)) return row;
  const visible = { ...row };
  for (const key of costKeys) delete visible[key];
  return visible;
}
