import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';

import type { BaseEntity } from '@shared/entities/base.entity';
import type { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';

export async function findByIdOrThrow<T extends { id: number }>(
  repo: Repository<T>,
  id: number,
  label: string,
): Promise<T> {
  const item = await repo.findOne({
    where: { id } as FindOptionsWhere<T>,
  });
  if (!item) {
    throw new NotFoundException(`${label} ${id} not found`);
  }
  return item;
}

export async function findActiveByIdOrThrow<T extends BaseEntity>(
  repo: Repository<T>,
  id: number,
  label: string,
): Promise<T> {
  const item = await repo.findOne({
    where: { id, isDeleted: false } as FindOptionsWhere<T>,
  });
  if (!item) {
    throw new NotFoundException(`${label} ${id} not found`);
  }
  return item;
}

/**
 * Reads the live (not soft-deleted) rows of `ids` in one query, keyed by id — the preload that
 * replaces a `findOne` per id inside a loop. An id with no live row is simply absent.
 */
export async function findActiveByIds<E extends ObjectLiteral & { id: number }>(
  repo: Repository<E>,
  ids: Iterable<number>,
): Promise<Map<number, E>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await repo.find({
    where: {
      id: In(unique),
      isDeleted: false,
    } as unknown as FindOptionsWhere<E>,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/** Reads rows by id in one query whatever their delete flag, keyed by id. */
export async function findAllByIds<E extends ObjectLiteral & { id: number }>(
  repo: Repository<E>,
  ids: Iterable<number>,
): Promise<Map<number, E>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await repo.find({
    where: { id: In(unique) } as unknown as FindOptionsWhere<E>,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Like {@link findActiveByIds}, but every id must have a live row, and the rows come back in the
 * order of `ids`: the first id without one raises the same 404 `findActiveByIdOrThrow` would, so
 * a batch that used to look rows up one by one keeps its error.
 */
export async function findActiveByIdsOrThrow<
  E extends BaseEntity & ObjectLiteral,
>(repo: Repository<E>, ids: readonly number[], label: string): Promise<E[]> {
  const found = await findActiveByIds(repo, ids);
  const rows: E[] = [];
  for (const id of ids) {
    rows.push(found.get(id) ?? (await findActiveByIdOrThrow(repo, id, label)));
  }
  return rows;
}
