import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStore } from '@shared/context/request-context.store';

/**
 * How much of the sales chain (customers, requests, estimates, quotations, orders) an actor
 * may read:
 *   all              — every record (managers, leads, administrators)
 *   ownSales         — records whose `salesOwnerId` is the actor
 *   assignedEngineer — requests (and their estimates) whose `assignedEngineerId` is the actor
 *
 * Permissions still decide which actions are allowed; the scope only decides which records an
 * allowed action reaches. A record outside the scope answers 404, never 403, so its existence
 * is not disclosed.
 */
export type DataScope = 'all' | 'ownSales' | 'assignedEngineer';

export const FULL_ACCESS_PERMISSION = '*:*';

/** Scope per seeded role code (D-12). An unknown role gets the narrowest scope. */
export const ROLE_DATA_SCOPES: Readonly<Record<string, DataScope>> = {
  admin: 'all',
  director: 'all',
  salesManager: 'all',
  engineeringLead: 'all',
  // Purchasing holds no sales-chain read permission; should one be granted later, it starts
  // from the narrowest scope rather than every record. The catalog has no owner to filter on.
  purchasing: 'ownSales',
  sales: 'ownSales',
  engineer: 'assignedEngineer',
};

const DEFAULT_DATA_SCOPE: DataScope = 'ownSales';

export interface ScopedActor {
  userId: number;
  role?: string;
  permissions?: readonly string[];
}

/** The owner fields a sales-chain record exposes to the scope check. */
export interface ScopedRecord {
  salesOwnerId?: number | null;
  assignedEngineerId?: number | null;
}

@Injectable()
export class DataScopeService {
  /** The scope one actor reads with: full access first, then the role, else the narrowest. */
  scopeOf(actor: ScopedActor): DataScope {
    if (actor.permissions?.includes(FULL_ACCESS_PERMISSION)) return 'all';
    return (actor.role && ROLE_DATA_SCOPES[actor.role]) || DEFAULT_DATA_SCOPE;
  }

  /** Whether the actor's scope reaches the record. */
  canSee(actor: ScopedActor, record: ScopedRecord): boolean {
    switch (this.scopeOf(actor)) {
      case 'all':
        return true;
      case 'ownSales':
        return record.salesOwnerId === actor.userId;
      case 'assignedEngineer':
        return record.assignedEngineerId === actor.userId;
    }
  }

  /** Returns the record when the scope reaches it, otherwise a 404 naming the record kind. */
  assertVisible<T extends ScopedRecord>(
    actor: ScopedActor,
    record: T | null | undefined,
    kind: string,
  ): T {
    if (!record || !this.canSee(actor, record)) {
      throw new NotFoundException(`${kind} not found`);
    }
    return record;
  }

  /** The signed-in actor of the current request, as the JWT guard recorded it. */
  currentActor(): ScopedActor | null {
    const { userId, role, permissions } = RequestContextStore.get();
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { userId: id, role, permissions };
  }
}
