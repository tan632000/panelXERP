import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import type { Item } from '@plugins/catalog/item/entities/item.entity';
import type { EntityManager, Repository } from 'typeorm';

/**
 * A scan resolves a value by barcode first and by code second, so no two active items may
 * answer to the same value: a code is never another item's barcode, and the other way round.
 */
export const CODE_IS_A_BARCODE_MESSAGE =
  'Item code already exists as the barcode of another item.';
export const BARCODE_IS_TAKEN_MESSAGE =
  'Barcode already exists as the barcode or code of another item.';

/** The code of an item about to be created must not be another active item's barcode. */
export function assertCodeNotABarcode(
  repo: Repository<Item>,
  code: string,
): Promise<void> {
  return assertCaseInsensitiveUnique(repo, {
    field: 'barcode',
    value: code,
    message: CODE_IS_A_BARCODE_MESSAGE,
  });
}

/** A barcode must be neither another active item's barcode nor another active item's code. */
export async function assertBarcodeAvailable(
  repo: Repository<Item>,
  barcode: string,
  itemId: number,
): Promise<void> {
  for (const field of ['barcode', 'code'] as const) {
    await assertCaseInsensitiveUnique(repo, {
      field,
      value: barcode,
      message: BARCODE_IS_TAKEN_MESSAGE,
      excludeId: itemId,
    });
  }
}

/**
 * Serialises every write of one code or barcode (any case) until its transaction ends. A code
 * and a barcode are checked against each other, so a create of code X and a barcode set to X
 * would each pass the check and then both commit; taking the same lock first makes the second
 * one see the first one's row. Sorted, so a writer holding several (the import) cannot
 * deadlock with another.
 */
export async function lockItemIdentifiers(
  manager: Pick<EntityManager, 'query'>,
  values: readonly string[],
): Promise<void> {
  const keys = [...new Set(values.map((value) => value.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();
  if (keys.length === 0) return;
  await manager.query(
    `SELECT pg_advisory_xact_lock(hashtext('item-identifier:' || key))
       FROM (SELECT unnest($1::text[]) AS key ORDER BY key) AS keys`,
    [keys],
  );
}
