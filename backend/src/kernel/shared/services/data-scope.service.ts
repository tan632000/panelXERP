import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStore } from '@shared/context/request-context.store';

/**
 * How much of the sales chain (customers, requests, estimates, quotations, orders) an actor
 * may read:
 *   all              — every record (managers, leads, administrators)
 *   ownSales         — records whose `salesOwnerId` is the actor
 *   assignedEngineer — requests (and their estimates) whose `assignedEngineerId` is the actor
 *   material         — every order's material view (purchasing, storekeeper) and no sales-chain
 *                      record: customers, requests, estimates, quotations and orders stay hidden
 *   assignedTechnician — the production cabinets assigned to the actor; no sales-chain record and
 *                      no material view
 *
 * Permissions still decide which actions are allowed; the scope only decides which records an
 * allowed action reaches. A record outside the scope answers 404, never 403, so its existence
 * is not disclosed.
 */
export type DataScope =
  'all' | 'ownSales' | 'assignedEngineer' | 'material' | 'assignedTechnician';

/** An owner id no user has, so `owner = NO_OWNER_ID` matches no row. */
export const NO_OWNER_ID = -1;

export const FULL_ACCESS_PERMISSION = '*:*';

/** Scope per seeded role code (D-12). An unknown role gets the narrowest scope. */
export const ROLE_DATA_SCOPES: Readonly<Record<string, DataScope>> = {
  admin: 'all',
  director: 'all',
  salesManager: 'all',
  engineeringLead: 'all',
  // Purchasing and the storekeeper read every order's materials but hold no sales-chain
  // permission; should one be granted later, `material` still reaches no sales-chain record.
  purchasing: 'material',
  storekeeper: 'material',
  // The production manager plans every order's production and reads its materials, never a
  // sales-chain record; a technician reaches only the cabinets assigned to them.
  productionManager: 'material',
  technician: 'assignedTechnician',
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

/**
 * The order-owner condition a material list adds for a scope: none for `all` and `material`,
 * the actor's own orders for `ownSales`, and an owner nobody has (match nothing) otherwise.
 */
export function materialListCondition(
  scope: DataScope,
  userId: number,
): { salesOwnerId?: number } {
  switch (scope) {
    case 'all':
    case 'material':
      return {};
    case 'ownSales':
      return { salesOwnerId: userId };
    case 'assignedEngineer':
    case 'assignedTechnician':
      return { salesOwnerId: NO_OWNER_ID };
  }
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
      case 'material':
      case 'assignedTechnician':
        return false;
    }
  }

  /**
   * Whether the actor may read the material view of an order: the `material` scope reaches
   * every order, a sales actor only their own, an engineer or a technician none.
   */
  canSeeMaterial(
    actor: ScopedActor,
    record: Pick<ScopedRecord, 'salesOwnerId'>,
  ): boolean {
    switch (this.scopeOf(actor)) {
      case 'all':
      case 'material':
        return true;
      case 'ownSales':
        return record.salesOwnerId === actor.userId;
      case 'assignedEngineer':
      case 'assignedTechnician':
        return false;
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
