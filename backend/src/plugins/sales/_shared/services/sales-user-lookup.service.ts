import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

export interface UserOption {
  id: number;
  fullName: string;
}

/** How a customer reaches the account that sends them a document. */
export interface UserContact {
  fullName: string;
  phone: string | null;
  email: string | null;
}

/**
 * The few things the sales documents ask about accounts: who may be named in a role-bound
 * field (owner, engineer), and what to call an account on a list. Reading through here keeps
 * a document feature from needing `user:read`, which its actors do not hold.
 */
@Injectable()
export class SalesUserLookup {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /** Whether the account is live and holds at least one of the roles. */
  hasActiveRole(
    userId: number,
    roleCodes: readonly string[],
  ): Promise<boolean> {
    return this.activeWithRoles(roleCodes)
      .andWhere('account.id = :userId', { userId })
      .getExists();
  }

  /** The live accounts holding at least one of the roles, by name. */
  async listActiveWithRoles(
    roleCodes: readonly string[],
  ): Promise<UserOption[]> {
    const accounts = await this.activeWithRoles(roleCodes)
      .select(['account.id', 'account.fullName'])
      .orderBy('account.fullName', 'ASC')
      .getMany();
    return accounts.map(({ id, fullName }) => ({ id, fullName }));
  }

  /** Names by id, deleted accounts included: a document keeps naming who worked on it. */
  async namesOf(ids: ReadonlyArray<number | null | undefined>) {
    const wanted = [
      ...new Set(ids.filter((id): id is number => typeof id === 'number')),
    ];
    if (wanted.length === 0) return new Map<number, string>();
    const accounts = await this.userRepo.find({
      where: { id: In(wanted) },
      select: { id: true, fullName: true },
      withDeleted: true,
    });
    return new Map(accounts.map(({ id, fullName }) => [id, fullName]));
  }

  /** Name, phone and email of one account, deleted ones included; `null` for an unknown id. */
  async contactOf(id: number): Promise<UserContact | null> {
    const account = await this.userRepo.findOne({
      where: { id },
      select: { id: true, fullName: true, phone: true, email: true },
      withDeleted: true,
    });
    if (!account) return null;
    return {
      fullName: account.fullName,
      phone: account.phone ?? null,
      email: account.email ?? null,
    };
  }

  private activeWithRoles(roleCodes: readonly string[]) {
    return this.userRepo
      .createQueryBuilder('account')
      .innerJoin(UserRole, 'accountRole', 'accountRole.userId = account.id')
      .innerJoin(Role, 'role', 'role.id = accountRole.roleId')
      .where('account.isDeleted = false')
      .andWhere('account.isActive = true')
      .andWhere('role.code IN (:...roleCodes)', { roleCodes: [...roleCodes] });
  }
}
