import { Injectable } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

export interface ProductionGuardHandlers {
  /** Before the `finishing` stage of a cabinet goes back from `done`; throw to veto the undo. */
  beforeFinishingUndo?: (
    manager: EntityManager,
    unitId: number,
  ) => Promise<void>;
  /** Before a production order is cancelled; throw to veto the cancel. */
  beforeCancel?: (
    manager: EntityManager,
    productionOrderId: number,
  ) => Promise<void>;
}

/**
 * Lets the features that build on a finished cabinet (QC, delivery) veto a production change
 * without production importing them. Every guard runs inside production's own transaction,
 * after its locks, so what a guard reads cannot change before the commit; a throwing guard
 * aborts the change. With no guard registered nothing changes.
 */
@Injectable()
export class ProductionGuardRegistry {
  private readonly handlers = new Map<string, ProductionGuardHandlers>();

  /** `name` identifies the registering feature; a second registration under it is a bug. */
  register(name: string, handlers: ProductionGuardHandlers): void {
    if (this.handlers.has(name)) {
      throw new Error(`Production guard "${name}" is already registered`);
    }
    this.handlers.set(name, handlers);
  }

  async beforeFinishingUndo(
    manager: EntityManager,
    unitId: number,
  ): Promise<void> {
    for (const handlers of this.handlers.values()) {
      await handlers.beforeFinishingUndo?.(manager, unitId);
    }
  }

  async beforeCancel(
    manager: EntityManager,
    productionOrderId: number,
  ): Promise<void> {
    for (const handlers of this.handlers.values()) {
      await handlers.beforeCancel?.(manager, productionOrderId);
    }
  }
}
