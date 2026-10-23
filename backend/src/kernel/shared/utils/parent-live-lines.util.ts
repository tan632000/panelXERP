import type { EntityManager, EntityTarget } from 'typeorm';

/**
 * Ids, among `parentIds`, of the documents that still hold at least one live line — one grouped
 * read instead of a count per document. A bulk line delete uses it to find the documents it just
 * emptied: those are the ids left out of the result.
 *
 * `lineEntity` is any soft-deleted line entity; `parentColumn` is its property pointing back at
 * the document (e.g. `requestId`, `masterId`) and must be a plain identifier.
 */
export async function findParentIdsWithLiveLines<
  Line extends { isDeleted: boolean },
>(
  manager: EntityManager,
  lineEntity: EntityTarget<Line>,
  parentColumn: keyof Line & string,
  parentIds: readonly number[],
): Promise<Set<number>> {
  if (parentIds.length === 0) return new Set();
  const rows = await manager
    .createQueryBuilder(lineEntity, 'line')
    .select(`line.${parentColumn}`, 'parentId')
    .where(`line.${parentColumn} IN (:...parentIds)`, { parentIds })
    .andWhere('line.isDeleted = false')
    .groupBy(`line.${parentColumn}`)
    .getRawMany<{ parentId: number | string }>();
  return new Set(rows.map((row) => Number(row.parentId)));
}
