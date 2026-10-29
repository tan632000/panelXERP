import { Injectable, Logger } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

/** The order a lifecycle hook runs for. */
export interface OrderLifecycleEvent {
  orderId: number;
  actorId: number;
}

/** What a hook changed: the orders whose reservation moved, and the items it touched. */
export interface OrderLifecycleResult {
  changedOrderIds: number[];
  touchedItemIds: number[];
}

export interface OrderLifecycleHandlers {
  /** Inside the convert transaction, after the order, its lines and the request `won`. */
  onCreated?: (
    manager: EntityManager,
    event: OrderLifecycleEvent,
  ) => Promise<OrderLifecycleResult>;
  /** Inside the cancel transaction, after the order moved to cancelled and the request lost. */
  onCancelled?: (
    manager: EntityManager,
    event: OrderLifecycleEvent,
  ) => Promise<OrderLifecycleResult>;
  /** After the transaction committed, with what this handler's hook returned. */
  afterCommit?: (result: OrderLifecycleResult) => Promise<void>;
}

/** The after-commit work of one convert or cancel, to run once its transaction committed. */
export interface PendingOrderLifecycle {
  afterCommit(): Promise<void>;
}

/**
 * Lets the features that follow an order (inventory reservations) act in the order's own
 * transaction without the order feature importing them. Synchronous on purpose, like the
 * request close: an order created without its reservation, or cancelled while keeping one,
 * would leave stock nobody can use. A failing hook aborts the convert or the cancel.
 *
 * The hooks run at the END of the transaction, after every sales row was written, so their
 * stock locks come last in the global lock order.
 */
@Injectable()
export class OrderLifecycleRegistry {
  private readonly logger = new Logger(OrderLifecycleRegistry.name);
  private readonly handlers = new Map<string, OrderLifecycleHandlers>();

  /** `name` identifies the registering feature; a second registration under it is a bug. */
  register(name: string, handlers: OrderLifecycleHandlers): void {
    if (this.handlers.has(name)) {
      throw new Error(
        `Order lifecycle handler "${name}" is already registered`,
      );
    }
    this.handlers.set(name, handlers);
  }

  created(
    manager: EntityManager,
    event: OrderLifecycleEvent,
  ): Promise<PendingOrderLifecycle> {
    return this.run('onCreated', manager, event);
  }

  cancelled(
    manager: EntityManager,
    event: OrderLifecycleEvent,
  ): Promise<PendingOrderLifecycle> {
    return this.run('onCancelled', manager, event);
  }

  private async run(
    hook: 'onCreated' | 'onCancelled',
    manager: EntityManager,
    event: OrderLifecycleEvent,
  ): Promise<PendingOrderLifecycle> {
    const done: Array<[string, OrderLifecycleHandlers, OrderLifecycleResult]> =
      [];
    for (const [name, handlers] of this.handlers) {
      const handle = handlers[hook];
      if (!handle) continue;
      done.push([name, handlers, await handle(manager, event)]);
    }
    return {
      afterCommit: async () => {
        for (const [name, handlers, result] of done) {
          try {
            await handlers.afterCommit?.(result);
          } catch (error: unknown) {
            // The order is committed: a failed follow-up is logged, never undone.
            this.logger.error(
              `Order lifecycle follow-up "${name}" failed for order ${event.orderId}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      },
    };
  }
}
