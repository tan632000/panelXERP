import { findByIdOrThrow } from '@shared/utils/repository.util';

import type { BaseEntity } from '@shared/entities/base.entity';
import type { Repository } from 'typeorm';

/** Dual-flag soft delete: set audit fields, then TypeORM softRemove. */
export async function softDeleteWithAudit<T extends BaseEntity>(
  repo: Repository<T>,
  entity: T,
  userId: number,
): Promise<{ id: number }> {
  entity.deletedBy = userId;
  entity.isDeleted = true;
  await repo.save(entity);
  await repo.softRemove(entity);
  return { id: entity.id };
}

/** Simple soft remove via TypeORM @DeleteDateColumn (no audit flags). */
export async function softRemoveById<T extends { id: number }>(
  repo: Repository<T>,
  id: number,
  label: string,
): Promise<{ id: number }> {
  const item = await findByIdOrThrow(repo, id, label);
  await repo.softRemove(item);
  return { id };
}
