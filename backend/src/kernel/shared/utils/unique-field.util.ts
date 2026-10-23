import { ConflictException } from '@nestjs/common';

import { caseInsensitiveEquals } from '@shared/utils/typeorm-search.util';

import type { FindOptionsWhere, Repository } from 'typeorm';

export async function assertCaseInsensitiveUnique<T extends { id: number }>(
  repo: Repository<T>,
  options: {
    field: keyof T & string;
    value: string;
    message: string;
    excludeId?: number;
    includeDeleted?: boolean;
  },
): Promise<void> {
  const where: Record<string, unknown> = {
    [options.field]: caseInsensitiveEquals(options.value.trim()),
  };

  if (!options.includeDeleted) {
    where.isDeleted = false;
  }

  const existing = await repo.findOne({
    where: where as FindOptionsWhere<T>,
  });
  if (existing && existing.id !== options.excludeId) {
    throw new ConflictException(options.message);
  }
}
