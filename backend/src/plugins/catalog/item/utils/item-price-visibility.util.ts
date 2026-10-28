import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';

import { REFERENCE_PRICE_READ } from '@plugins/catalog/item/permissions/item.permissions';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

export function canReadReferencePrice(actor: AuthUserPayload): boolean {
  return matchesPermission(actor.permissions ?? [], REFERENCE_PRICE_READ);
}

/**
 * The item as the actor may see it. The key itself is dropped, not nulled: a storekeeper must
 * not learn that a price exists. The internal readers (estimate lines, the catalog gateway) never
 * pass through here.
 */
export function presentItem<T extends { referencePrice?: number | null }>(
  item: T,
  actor: AuthUserPayload,
): T | Omit<T, 'referencePrice'> {
  if (canReadReferencePrice(actor)) return item;
  const { referencePrice: _hidden, ...visible } = item;
  return visible;
}

/** A page of items as the actor may see it. */
export function presentItemPage<
  T extends { referencePrice?: number | null },
  P extends { data: T[] },
>(page: P, actor: AuthUserPayload) {
  if (canReadReferencePrice(actor)) return page;
  return { ...page, data: page.data.map((item) => presentItem(item, actor)) };
}
