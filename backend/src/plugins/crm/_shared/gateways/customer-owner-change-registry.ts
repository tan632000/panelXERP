import { Injectable } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

/**
 * Runs inside the CRM transaction that reassigns a customer, on its manager: whatever a
 * plugin writes through it commits or rolls back with the reassignment.
 */
export type CustomerOwnerChangeHandler = (
  manager: EntityManager,
  customerId: number,
  newOwnerId: number,
) => Promise<void>;

/**
 * Lets plugins whose documents follow their customer's sales owner (requests, quotations,
 * orders) move those documents in the same transaction that reassigns the customer, without
 * CRM importing them: each registers one handler at start-up and the customer update calls
 * them all. Synchronous on purpose — a document left with the old owner after the customer
 * moved would be invisible to the new owner.
 */
@Injectable()
export class CustomerOwnerChangeRegistry {
  private readonly handlers = new Map<string, CustomerOwnerChangeHandler>();

  /** `name` identifies the registering document kind; a second handler under it is a bug. */
  register(name: string, handler: CustomerOwnerChangeHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(
        `Customer owner-change handler "${name}" is already registered`,
      );
    }
    this.handlers.set(name, handler);
  }

  /** Runs every handler in registration order; the first failure aborts the caller's transaction. */
  async apply(
    manager: EntityManager,
    customerId: number,
    newOwnerId: number,
  ): Promise<void> {
    for (const handler of this.handlers.values()) {
      await handler(manager, customerId, newOwnerId);
    }
  }
}
