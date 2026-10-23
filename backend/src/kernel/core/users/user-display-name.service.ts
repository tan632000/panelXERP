import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { User } from '@kernel/core/users/entities/user.entity';

/**
 * Resolves the human display name behind an audit column.
 *
 * Header metadata names the actor who created or last updated a record, and a header must
 * never fall back to a login name or the raw numeric id, so an unresolvable id yields no
 * entry at all and the caller renders the shared empty marker instead.
 */
@Injectable()
export class UserDisplayNameService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async resolveMany(
    ids: Array<number | null | undefined>,
  ): Promise<Map<number, string>> {
    const unique = [
      ...new Set(
        ids.filter(
          (id): id is number => Number.isInteger(id) && (id as number) > 0,
        ),
      ),
    ];
    if (!unique.length) return new Map();

    const rows = await this.userRepo.find({
      where: { id: In(unique) },
      select: { id: true, fullName: true },
    });

    return new Map(
      rows
        .filter((row) => row.fullName?.trim())
        .map((row) => [row.id, row.fullName.trim()] as const),
    );
  }

  async resolveOne(id?: number | null): Promise<string | null> {
    const resolved = await this.resolveMany([id]);
    return resolved.get(id as number) ?? null;
  }
}
